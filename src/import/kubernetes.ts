// orrery import kubernetes: Kubernetes manifests (a file or a folder, Helm and Kustomize output included) to a spec, every node carrying the evidence it came from.
//
// Workloads, Services, Ingresses and Gateways are nodes, inside a cluster group with a group per
// namespace; replicas are the badge and an autoscaler's range goes in the note. Flows come from
// Service selectors (Service to the pods it selects), Ingress and HTTPRoute backends, environment
// values (direct, or from a ConfigMap) that hold another Service's DNS name, and NetworkPolicy
// rules that let one workload's pods reach another's.
import { readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { at, Draft, displayPath, hostsIn, humanize, portLabel } from "./iac.ts";
import { asList, isObj, lineOf, type Obj, readSources, type Source, text } from "./source.ts";
import { K8S, K8S_GLUE } from "./tables.ts";
import type { Imported } from "./types.ts";

interface Item {
  kind: string;
  name: string;
  namespace?: string;
  body: Obj;
  src: Source;
  /** The path to the object inside its document: [] or ["items", i] for a List. */
  base: (string | number)[];
  shown: string;
  key: string;
}

const USERS = "users";
/** Kinds with no namespace: they never land in "default". */
const CLUSTER_SCOPED =
  /^(Namespace|StorageClass|ClusterRole|ClusterRoleBinding|PersistentVolume|CustomResourceDefinition|IngressClass|GatewayClass|PriorityClass|Node|ClusterIssuer)$/;
const WORKLOADS = new Set([
  "Deployment",
  "StatefulSet",
  "DaemonSet",
  "Job",
  "CronJob",
  "Pod",
  "ReplicaSet",
]);

export async function importKubernetes(path: string): Promise<Imported> {
  const items = readItems(path);
  if (!items.length) throw new Error(`${path} has no Kubernetes objects (kind and metadata.name)`);
  return new Kubernetes(items, path).run();
}

function manifestFiles(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path)
    .sort()
    .flatMap((f) => {
      const full = join(path, f);
      if (statSync(full).isDirectory()) return manifestFiles(full);
      return /\.(ya?ml|json)$/i.test(f) ? [full] : [];
    });
}

function readItems(path: string): Item[] {
  const out: Item[] = [];
  for (const file of manifestFiles(path)) {
    const shown = displayPath(file);
    for (const src of readSources(file)) {
      const data = src.data;
      if (!isObj(data)) continue;
      const list =
        data.kind === "List" || (text(data.kind)?.endsWith("List") && Array.isArray(data.items));
      const objects: [Obj, (string | number)[]][] = list
        ? asList(data.items).flatMap((x, i) =>
            isObj(x) ? [[x, ["items", i]] as [Obj, (string | number)[]]] : [],
          )
        : [[data, []]];
      for (const [body, base] of objects) {
        const meta = isObj(body.metadata) ? body.metadata : {};
        const kind = text(body.kind);
        const name = text(meta.name);
        if (!kind || !name) continue;
        const namespace = text(meta.namespace);
        out.push({
          kind,
          name,
          ...(namespace ? { namespace } : {}),
          body,
          src,
          base,
          shown,
          key: "",
        });
      }
    }
  }
  // Namespaced objects without a namespace land in "default" once any object names one.
  const namespaced = out.some((i) => i.namespace && !CLUSTER_SCOPED.test(i.kind));
  for (const i of out) {
    if (namespaced && !i.namespace && !CLUSTER_SCOPED.test(i.kind)) i.namespace = "default";
    i.key = `${i.kind}/${i.namespace ?? ""}/${i.name}`;
  }
  return out;
}

class Kubernetes {
  readonly draft = new Draft();
  readonly items: Item[];
  readonly path: string;
  readonly services: Item[];
  readonly workloads: Item[];

  constructor(items: Item[], path: string) {
    this.items = items;
    this.path = path;
    this.services = items.filter((i) => i.kind === "Service");
    this.workloads = items.filter((i) => WORKLOADS.has(i.kind));
  }

  where(item: Item, path: (string | number)[], ident: string): string {
    return at(item.shown, lineOf(item.src, [...item.base, ...path]), ident);
  }

  run(): Imported {
    const shown = displayPath(this.path);
    const cluster = this.draft.group("cluster", {
      type: "k8s:cluster",
      label: "Kubernetes cluster",
      hint: "cluster",
      evidence: [shown],
    });
    for (const ns of new Set(this.items.map((i) => i.namespace).filter(Boolean))) {
      const decl = this.items.find((i) => i.kind === "Namespace" && i.name === ns);
      this.draft.group(`ns:${ns}`, {
        type: "k8s:namespace",
        label: `Namespace ${ns}`,
        parent: cluster,
        hint: `ns-${ns}`,
        evidence: [
          decl ? this.where(decl, ["metadata", "name"], ns ?? "") : at(shown, undefined, ns ?? ""),
        ],
      });
    }
    for (const item of this.items) this.node(item);
    this.serviceFlows();
    this.ingressFlows();
    this.envFlows();
    this.policyFlows();
    const drawn = [...this.draft.nodes.keys()].filter((k) => k !== USERS).length;
    const namespaces = new Set(
      [...this.draft.nodes.values()].map((n) => n.parent).filter((p) => p?.startsWith("ns:")),
    ).size;
    return this.draft.write({
      title: titleOf(this.path),
      subtitle: `From Kubernetes manifests: ${drawn} objects drawn${namespaces ? ` in ${namespaces} namespace${namespaces > 1 ? "s" : ""}` : ""}, ${this.draft.leftOut.size} left out`,
      command: `orrery import kubernetes ${shown}`,
    });
  }

  private node(item: Item) {
    const kind = K8S[item.kind];
    if (item.kind === "Namespace") return this.draft.leave(item.key, K8S_GLUE.Namespace ?? "group");
    if (!kind) {
      const why = K8S_GLUE[item.kind];
      if (!why)
        this.draft.warn(`${item.key}: ${item.kind} is not in the import table, so it is not drawn`);
      return this.draft.leave(item.key, why ?? "no icon for this kind in the import table");
    }
    const spec = isObj(item.body.spec) ? item.body.spec : {};
    let what = kind.what;
    let copies = 1;
    if (WORKLOADS.has(item.kind)) {
      const image = this.containers(item)[0]?.image;
      if (image) what = `${what}, ${text(image)?.split("/").at(-1)}`;
      copies = Number(spec.replicas ?? 1);
      const hpa = this.items.find(
        (h) =>
          h.kind === "HorizontalPodAutoscaler" &&
          h.namespace === item.namespace &&
          isObj(h.body.spec) &&
          isObj(h.body.spec.scaleTargetRef) &&
          h.body.spec.scaleTargetRef.name === item.name,
      );
      const hs = isObj(hpa?.body.spec) ? hpa.body.spec : undefined;
      if (hs) {
        what = `${what}, scales ${hs.minReplicas ?? 1} to ${hs.maxReplicas}`;
        copies = Number(hs.minReplicas ?? copies);
      }
    }
    if (item.kind === "Service") {
      const port = asList(spec.ports).find(isObj);
      const type = spec.clusterIP === "None" ? "Headless" : (text(spec.type) ?? "ClusterIP");
      what = `${type}${port ? ` :${port.port}` : ""}`;
    }
    if (item.kind === "CronJob" && text(spec.schedule)) what = `CronJob, ${spec.schedule}`;
    if (item.kind === "Ingress") {
      const hosts = asList(spec.rules)
        .map((r) => (isObj(r) ? text(r.host) : undefined))
        .filter(Boolean);
      if (hosts.length) what = `Ingress, ${hosts.join(", ")}`;
    }
    const twins = this.items.filter((i) => i.name === item.name && K8S[i.kind]).length > 1;
    // A workload sits beside the one Service that selects it, so the pair takes one layer
    // instead of two and a chain of services stays readable in a narrow column.
    const fronts = WORKLOADS.has(item.kind)
      ? this.services.filter(
          (s) =>
            s.namespace === item.namespace &&
            this.selects(
              isObj(s.body.spec) ? s.body.spec.selector : undefined,
              this.podOf(item).labels,
            ),
        )
      : [];
    this.draft.node(item.key, {
      ...(fronts.length === 1 && fronts[0] ? { align: fronts[0].key } : {}),
      icon: kind.icon,
      name: item.name,
      what,
      hint: twins
        ? `${item.name}-${item.kind === "Service" ? "svc" : item.kind.toLowerCase()}`
        : item.name,
      ...(item.namespace ? { parent: `ns:${item.namespace}` } : { parent: "cluster" }),
      copies: Number.isFinite(copies) ? copies : 1,
      evidence: [this.where(item, ["metadata", "name"], item.name)],
    });
  }

  /** The pod template: spec.template, a CronJob's job template, or a Pod's own spec. */
  podOf(item: Item): { labels: Obj; spec: Obj; path: string[] } {
    const spec = isObj(item.body.spec) ? item.body.spec : {};
    if (item.kind === "Pod") {
      const meta = isObj(item.body.metadata) ? item.body.metadata : {};
      return { labels: isObj(meta.labels) ? meta.labels : {}, spec, path: ["spec"] };
    }
    const job = item.kind === "CronJob" && isObj(spec.jobTemplate) && isObj(spec.jobTemplate.spec);
    const template = job ? (spec.jobTemplate as Obj & { spec: Obj }).spec.template : spec.template;
    const t = isObj(template) ? template : {};
    const meta = isObj(t.metadata) ? t.metadata : {};
    return {
      labels: isObj(meta.labels) ? meta.labels : {},
      spec: isObj(t.spec) ? t.spec : {},
      path: job
        ? ["spec", "jobTemplate", "spec", "template", "spec"]
        : ["spec", "template", "spec"],
    };
  }

  containers(item: Item): Obj[] {
    const pod = this.podOf(item).spec;
    return [...asList(pod.initContainers), ...asList(pod.containers)].filter(isObj);
  }

  selects(selector: unknown, labels: Obj): boolean {
    const want = isObj(selector) && isObj(selector.matchLabels) ? selector.matchLabels : selector;
    if (!isObj(want)) return false;
    const pairs = Object.entries(want);
    return pairs.length > 0 && pairs.every(([k, v]) => labels[k] === v);
  }

  /** Workloads in a namespace whose pods carry every label of a selector. */
  selected(selector: unknown, namespace: string | undefined): Item[] {
    return this.workloads.filter(
      (w) => w.namespace === namespace && this.selects(selector, this.podOf(w).labels),
    );
  }

  private fromUsers(to: string, label: string, evidence: string[]) {
    const users = K8S.users;
    if (!users) return;
    this.draft.node(USERS, { icon: users.icon, name: "Users", what: "", hint: "users", evidence });
    this.draft.edge(USERS, to, label, evidence);
  }

  private serviceFlows() {
    for (const svc of this.services) {
      const spec = isObj(svc.body.spec) ? svc.body.spec : {};
      const port = asList(spec.ports).find(isObj);
      const target = Number(port?.targetPort ?? port?.port);
      const label = target ? portLabel(target) : undefined;
      const ev = [this.where(svc, ["spec", "selector"], "selector")];
      for (const w of this.selected(spec.selector, svc.namespace))
        this.draft.edge(svc.key, w.key, label, ev);
      const type = text(spec.type);
      if (type === "LoadBalancer" || type === "NodePort") {
        const p = Number(port?.port);
        this.fromUsers(svc.key, p ? portLabel(p) : "TCP", [
          this.where(svc, ["spec", "type"], type),
        ]);
      }
    }
  }

  serviceNamed(name: string | undefined, namespace: string | undefined): Item | undefined {
    return this.services.find((s) => s.name === name && s.namespace === namespace);
  }

  private ingressFlows() {
    for (const ing of this.items.filter((i) => i.kind === "Ingress")) {
      const spec = isObj(ing.body.spec) ? ing.body.spec : {};
      const tls = asList(spec.tls).length > 0;
      this.fromUsers(ing.key, tls ? "HTTPS" : "HTTP", [
        this.where(ing, ["metadata", "name"], ing.name),
      ]);
      const backend = (b: unknown, path: (string | number)[], label: string | undefined) => {
        if (!isObj(b)) return;
        const name = isObj(b.service) ? text(b.service.name) : text(b.serviceName);
        const svc = this.serviceNamed(name, ing.namespace);
        // The line that names the Service: backend.service.name, or the older backend.serviceName.
        const at = isObj(b.service) ? [...path, "service", "name"] : [...path, "serviceName"];
        if (svc) this.draft.edge(ing.key, svc.key, label, [this.where(ing, at, name ?? "")]);
      };
      backend(
        spec.defaultBackend ?? spec.backend,
        ["spec", spec.defaultBackend ? "defaultBackend" : "backend"],
        "/",
      );
      asList(spec.rules).forEach((r, i) => {
        const paths = isObj(r) && isObj(r.http) ? asList(r.http.paths) : [];
        paths.forEach((p, j) => {
          if (!isObj(p)) return;
          backend(
            p.backend,
            ["spec", "rules", i, "http", "paths", j, "backend"],
            text(p.path) ?? "/",
          );
        });
      });
    }
    for (const gw of this.items.filter((i) => i.kind === "Gateway")) {
      const listeners = isObj(gw.body.spec) ? asList(gw.body.spec.listeners).filter(isObj) : [];
      const label = listeners.some((l) => l.protocol === "HTTPS") ? "HTTPS" : "HTTP";
      this.fromUsers(gw.key, label, [this.where(gw, ["metadata", "name"], gw.name)]);
    }
    for (const route of this.items.filter(
      (i) => i.kind === "HTTPRoute" || i.kind === "GRPCRoute",
    )) {
      const spec = isObj(route.body.spec) ? route.body.spec : {};
      const gateways = asList(spec.parentRefs)
        .filter(isObj)
        .map((p) =>
          this.items.find(
            (g) =>
              g.kind === "Gateway" &&
              g.name === p.name &&
              g.namespace === (text(p.namespace) ?? route.namespace),
          ),
        )
        .filter((g): g is Item => !!g);
      asList(spec.rules).forEach((rule, i) => {
        if (!isObj(rule)) return;
        const match = asList(rule.matches).find(isObj);
        const path = isObj(match?.path) ? text(match.path.value) : undefined;
        asList(rule.backendRefs).forEach((b, j) => {
          if (!isObj(b)) return;
          const svc = this.serviceNamed(text(b.name), text(b.namespace) ?? route.namespace);
          const ev = [
            this.where(route, ["spec", "rules", i, "backendRefs", j, "name"], text(b.name) ?? ""),
          ];
          if (svc) for (const gw of gateways) this.draft.edge(gw.key, svc.key, path, ev);
        });
      });
    }
  }

  /** The Service an environment host names: svc, svc.ns, svc.ns.svc or svc.ns.svc.cluster.local. */
  serviceFor(host: string, namespace: string | undefined): Item | undefined {
    const short = host.replace(/\.svc(\.cluster\.local)?$/, "");
    const [name, ns, ...rest] = short.split(".");
    // Any more labels make an outside hostname (api.stripe.com), never a Service.
    if (rest.length) return undefined;
    if (!ns) return this.serviceNamed(name, namespace);
    const svc = this.serviceNamed(name, ns);
    if (svc || namespace) return svc;
    // With no namespaces in the manifests, svc.ns is a Service only when it says so (.svc, default).
    return short !== host || ns === "default" ? this.serviceNamed(name, undefined) : undefined;
  }

  private envFlows() {
    const configMaps = this.items.filter((i) => i.kind === "ConfigMap");
    for (const w of this.workloads) {
      const base = this.podOf(w).path;
      const containers = this.podOf(w).spec;
      for (const field of ["initContainers", "containers"]) {
        asList(containers[field]).forEach((c, ci) => {
          if (!isObj(c)) return;
          const at = [...base, field, ci];
          asList(c.env).forEach((e, ei) => {
            if (!isObj(e)) return;
            const name = text(e.name) ?? "";
            const value = text(e.value);
            if (value)
              this.hostFlows(w, name, value, this.where(w, [...at, "env", ei, "name"], name));
            const ref =
              isObj(e.valueFrom) && isObj(e.valueFrom.configMapKeyRef)
                ? e.valueFrom.configMapKeyRef
                : undefined;
            const cm =
              ref && configMaps.find((m) => m.name === ref.name && m.namespace === w.namespace);
            const key = text(ref?.key);
            const data = cm && isObj(cm.body.data) ? cm.body.data : {};
            const v = key ? text(data[key]) : undefined;
            if (cm && key && v) this.hostFlows(w, name, v, this.where(cm, ["data", key], key));
          });
          for (const from of asList(c.envFrom)) {
            const ref = isObj(from) && isObj(from.configMapRef) ? from.configMapRef : undefined;
            const cm =
              ref && configMaps.find((m) => m.name === ref.name && m.namespace === w.namespace);
            if (!cm || !isObj(cm.body.data)) continue;
            for (const [k, v] of Object.entries(cm.body.data))
              if (typeof v === "string") this.hostFlows(w, k, v, this.where(cm, ["data", k], k));
          }
        });
      }
    }
  }

  private hostFlows(w: Item, key: string, value: string, evidence: string) {
    for (const ref of hostsIn(key, value)) {
      const svc = this.serviceFor(ref.host, w.namespace);
      if (!svc) continue;
      // A workload's own Service is not a flow out of it.
      if (
        this.selected(
          isObj(svc.body.spec) ? svc.body.spec.selector : undefined,
          svc.namespace,
        ).includes(w)
      )
        continue;
      this.draft.edge(w.key, svc.key, ref.label, [evidence]);
    }
  }

  /** NetworkPolicy ingress rules: pods they let in reach the policy's pods (through their Service). */
  private policyFlows() {
    for (const np of this.items.filter((i) => i.kind === "NetworkPolicy")) {
      const spec = isObj(np.body.spec) ? np.body.spec : {};
      const targets = this.selected(spec.podSelector, np.namespace);
      asList(spec.ingress).forEach((rule, i) => {
        if (!isObj(rule)) return;
        const port = asList(rule.ports).find(isObj);
        const label = port && Number(port.port) ? portLabel(Number(port.port)) : undefined;
        asList(rule.from).forEach((peer, j) => {
          if (!isObj(peer) || peer.namespaceSelector || peer.ipBlock) return;
          const ev = [this.where(np, ["spec", "ingress", i, "from", j], "podSelector")];
          for (const src of this.selected(peer.podSelector, np.namespace))
            for (const t of targets) {
              const front = this.services.find(
                (s) =>
                  s.namespace === t.namespace &&
                  this.selects(
                    isObj(s.body.spec) ? s.body.spec.selector : undefined,
                    this.podOf(t).labels,
                  ),
              );
              if (src !== t) this.draft.edge(src.key, front?.key ?? t.key, label, ev);
            }
        });
      });
    }
  }
}

function titleOf(path: string): string {
  const name = basename(path, extname(path));
  return /^(k8s|kubernetes|manifests?|deploy|base|all|resources|templates?)$/i.test(name)
    ? "Kubernetes workloads"
    : humanize(name);
}
