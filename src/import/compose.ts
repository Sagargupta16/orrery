// orrery import compose: a Docker Compose file to a spec, every node carrying the evidence it came from.
//
// Every service is a node, with a logo picked from its image and `deploy.replicas` as its badge;
// declared networks are groups (a service on one network sits in it, one on several stays
// outside). Flows come from environment values that hold another service's URL or host:port (a
// bare name only under a host-like key, so POSTGRES_USER: postgres is not a flow), from `links`,
// and from published ports, which users reach. `depends_on` is start order, never a flow.
import { basename, dirname } from "node:path";
import { at, Draft, displayPath, hostsIn, humanize, portLabel } from "./iac.ts";
import { asList, isObj, lineOf, type Obj, readSources, type Source, text } from "./source.ts";
import { CONTAINER, IMAGES, K8S } from "./tables.ts";
import type { Imported } from "./types.ts";

const USERS = "users";

export async function importCompose(path: string): Promise<Imported> {
  const src = readSources(path)[0];
  const data = src?.data;
  if (!src || !isObj(data) || !isObj(data.services))
    throw new Error(`${path} has no services: pass a Docker Compose file`);
  return composeSpec(src, data, path);
}

function composeSpec(src: Source, data: Obj, path: string): Imported {
  const draft = new Draft();
  const shown = displayPath(path);
  const services = data.services as Record<string, unknown>;
  const where = (keys: (string | number)[], ident: string) => at(shown, lineOf(src, keys), ident);

  // Networks each service joins; services that name none join the project's default network.
  const declared = isObj(data.networks) ? Object.keys(data.networks) : [];
  const joins = new Map<string, string[]>();
  for (const [name, s] of Object.entries(services)) {
    const nets = isObj(s) ? s.networks : undefined;
    joins.set(
      name,
      Array.isArray(nets) ? nets.map(String) : isObj(nets) ? Object.keys(nets) : ["default"],
    );
  }
  const drawNetworks = declared.length > 0;
  for (const net of new Set([...joins.values()].flat())) {
    if (!drawNetworks) break;
    const conf = isObj(data.networks) ? data.networks[net] : undefined;
    const internal = isObj(conf) && conf.internal === true;
    draft.group(`network:${net}`, {
      type: "zone",
      label: `${humanize(net)} network${internal ? " (internal)" : ""}`,
      hint: `${net}-network`,
      evidence: [
        declared.includes(net) ? where(["networks", net], net) : at(shown, undefined, net),
      ],
    });
  }

  // Every name another service can reach a service by: its name, container_name, hostname,
  // network aliases and link aliases.
  const hosts = new Map<string, string>();
  for (const [name, s] of Object.entries(services)) {
    hosts.set(name.toLowerCase(), name);
    if (!isObj(s)) continue;
    for (const alias of [text(s.container_name), text(s.hostname)])
      if (alias) hosts.set(alias.toLowerCase(), name);
    if (isObj(s.networks))
      for (const n of Object.values(s.networks))
        for (const a of asList(isObj(n) ? n.aliases : undefined).map(text))
          if (a) hosts.set(a.toLowerCase(), name);
  }

  for (const [name, s] of Object.entries(services)) {
    const svc = isObj(s) ? s : {};
    const image = text(svc.image);
    const kind = (image && IMAGES.find(([re]) => re.test(image.toLowerCase()))?.[1]) || CONTAINER;
    const build = isObj(svc.build) ? text(svc.build.context) : text(svc.build);
    const nets = joins.get(name) ?? [];
    const deploy = isObj(svc.deploy) ? svc.deploy : {};
    const copies = Number(deploy.replicas ?? svc.scale ?? 1);
    draft.node(name, {
      icon: kind.icon,
      name,
      what: image ? shortImage(image) : build ? `Built from ${build}` : kind.what,
      hint: name,
      ...(drawNetworks && nets.length === 1 ? { parent: `network:${nets[0]}` } : {}),
      copies: Number.isFinite(copies) ? copies : 1,
      evidence: [where(["services", name], name)],
    });
  }

  for (const [name, s] of Object.entries(services)) {
    if (!isObj(s)) continue;
    const base = ["services", name];
    // Environment values that point at another service.
    for (const [key, value, line] of envOf(s.environment, [...base, "environment"])) {
      for (const ref of hostsIn(key, value)) {
        const target = hosts.get(ref.host);
        if (target && target !== name) draft.edge(name, target, ref.label, [where(line, key)]);
      }
    }
    if (s.env_file)
      draft.warn(`${name}: env_file is not read; hosts named only there are not drawn`);
    asList(s.links).forEach((link, i) => {
      const target = text(link)?.split(":")[0];
      if (target && services[target] !== undefined)
        draft.edge(name, target, undefined, [where([...base, "links", i], target)]);
    });
    asList(s.ports).forEach((p, i) => {
      const published = publishedPort(p);
      if (!published) return;
      const users = K8S.users;
      const ev = [where([...base, "ports", i], String(published.host))];
      if (!users) return;
      draft.node(USERS, { icon: users.icon, name: "Users", what: "", hint: "users", evidence: ev });
      draft.edge(USERS, name, published.label, ev);
    });
    const depends = isObj(s.depends_on)
      ? Object.keys(s.depends_on)
      : asList(s.depends_on).map(String);
    if (depends.length)
      draft.leave(`services.${name}.depends_on`, `start order (${depends.join(", ")}), not a flow`);
  }
  for (const [kind, why] of [
    ["volumes", "storage a service keeps its data in"],
    ["secrets", "credentials, used by everything"],
    ["configs", "configuration files"],
  ] as const)
    if (isObj(data[kind]))
      for (const v of Object.keys(data[kind])) draft.leave(`${kind}.${v}`, why);

  const drawn = [...draft.nodes.keys()].filter((k) => k !== USERS).length;
  return draft.write({
    title: titleOf(data, path),
    subtitle: `From Docker Compose: ${drawn} services${drawNetworks ? `, ${declared.length} networks` : ""}`,
    command: `orrery import compose ${shown}`,
  });
}

/** `environment:` as a list of KEY=VALUE or a mapping: key, value and the path to its line. */
function envOf(env: unknown, base: (string | number)[]): [string, string, (string | number)[]][] {
  if (Array.isArray(env))
    return env.flatMap((e, i) => {
      const [key = "", ...rest] = String(e).split("=");
      return rest.length
        ? [[key, rest.join("="), [...base, i]] as [string, string, (string | number)[]]]
        : [];
    });
  if (isObj(env))
    return Object.entries(env).flatMap(([k, v]) => {
      const value = text(v);
      return value ? [[k, value, [...base, k]] as [string, string, (string | number)[]]] : [];
    });
  return [];
}

/** A published port: "8080:80", "127.0.0.1:8080:80/tcp" or { target, published }; none for "80". */
function publishedPort(p: unknown): { host: number; label: string } | undefined {
  let host: number | undefined;
  let target: number | undefined;
  if (isObj(p)) {
    host = Number(p.published);
    target = Number(p.target);
  } else {
    const parts = String(p)
      .replace(/\/(tcp|udp)$/, "")
      .split(":");
    if (parts.length < 2) return undefined;
    target = Number(parts.at(-1)?.split("-")[0]);
    host = Number(parts.at(-2)?.split("-")[0]);
  }
  if (!host || !target) return undefined;
  const label =
    host === target ? portLabel(target) : `${portLabel(target).replace(/ :\d+$/, "")} :${host}`;
  return { host, label };
}

/** "ghcr.io/acme/api:1.4" reads "api:1.4"; official images keep their name. */
function shortImage(image: string): string {
  return image.split("/").at(-1) ?? image;
}

function titleOf(data: Obj, path: string): string {
  const name = text(data.name);
  if (name) return humanize(name);
  const stem = basename(path).replace(/\.(ya?ml)$/i, "");
  if (!/^(docker-)?compose(\.[a-z]+)?$/i.test(stem)) return humanize(stem);
  const dir = basename(dirname(displayPath(path)));
  return dir && dir !== "." ? humanize(dir) : "Compose project";
}
