# Conventions rubric: AWS

Source for AWS-01 to AWS-16: the AWS Architecture Icons deck, release 24-2026.07.31 (light background edition), from <https://aws.amazon.com/architecture/icons/>. Slide numbers refer to that deck. AWS-17 to AWS-19 are orrery's own composition rules, built on how the deck labels groups and services. Quotes are verbatim.

**[measured]** rules are checked by `orrery review`; the finding id is given. Do not re-report them; cite the measured finding when it matters for a patch. **[judged]** rules are yours: report a violation only with the rule id, its quote, and the spec ids it concerns. **[renderer]** rules are applied by orrery itself and cannot be fixed from the spec; do not report them.

## Structure

### AWS-01 Start from the groups [judged]

> "Start with the structure. Locate the groups (see slides 25-26) to use for the underlying structure of your diagram." (slide 11)

Boundaries nest the way the deployment does: `aws:cloud` > `aws:account` > `aws:region` > `aws:vpc` > `aws:az` > `aws:public-subnet` / `aws:private-subnet`. Flag a VPC outside a Region, subnets outside an AZ when AZs are drawn, a public-facing load balancer inside a private subnet, or AWS services drawn outside the AWS Cloud group while others sit inside it. Patch: `set groups.<id>.in` or `set nodes.<id>.in`.

### AWS-02 Inner groups keep a buffer [measured: `overlap.outside-group`]

> "When you have groups within groups, inner groups should have at least .05" buffer on all sides." (slide 14)

### AWS-03 Approved group icons [judged]

> "Create groups with nonapproved AWS icon(s)." (slide 14, under DON'T)

A group's `icon:` override must be an AWS group or service icon (`orrery icons search <name> --pack aws`), never a logo or glyph from another set. Use the generic group when no preset fits:

> "Use a generic group type if the presets do not suit your needs." (slide 14, under DO)

### AWS-04 The AWS logo group [judged]

> "use the group with the AWS logo except in Regions where the AWS logo cannot be used. You may use the group with the cloud icon in those cases." (slide 25)

`aws:cloud` carries the logo; `aws:cloud-alt` (cloud tile) only for Regions such as China.

### AWS-05 Group icons keep their size [renderer]

> "Resize group icons." (slide 14, under DON'T)

## Icons

### AWS-06 Icons as published [judged]

> "Use icons at their predefined size, color and format in diagrams." (slide 15, under DO)
>
> "Crop service icons." / "Flip or rotate icons." / "Change icon shapes." (slide 15, under DON'T)

The renderer draws vendor icons as published. Flag only a spec that works against it: a vendor service shown with a third-party logo or a `tabler:` glyph when `icons search` finds the AWS icon, or a resource icon used for a different service.

## Labels

### AWS-07 Labels fit on two lines and never break mid-word [measured: `conventions.label-lines`, `quality.mid-word-break`]

> "AWS service names must fit on no more than two lines. AWS or Amazon should always be accompanied by the service name. Lines should never break mid-word." (slide 17)

### AWS-08 Full service name before short forms [measured: `conventions.short-name`]

> "Use short forms without first mentioning the full service name somewhere in the document." (slide 17, under DON'T)

The measurement covers AWS service icons whose label or note uses the name without "Amazon"/"AWS", the initials, or a catalog alias (S3, EKS, DMS) while the full name appears nowhere in the diagram. Judge the case it cannot see: a retired product name (the catalog's official name differs from the label and the label is not a short form of it). A label that does not name the service at all is AWS-19's.

### AWS-09 AWS or Amazon stays with the name [judged]

> "AWS should be on the same line as the first word in the service name." (slide 17)

Check the PNG: a label that wraps as "AWS" alone on its first line breaks this. Patch: shorten the label, or move a qualifier into `note`.

### AWS-10 Short forms are unique [judged]

> "Duplicate short forms for different services, such as ELB for Elastic Beanstalk and Elastic Load Balancing." (slide 17, under DON'T)

### AWS-11 General icons take custom labels [judged]

> "General icons are flexible and their labels can be customized for your use-case." (slide 17)

General resources (users, client, servers, database, internet) need a label that says what they are in this system ("Customers", "On-premises servers"); a bare default ("Users") is fine only when nothing more specific is true.

## Arrows

### AWS-12 Preset arrows, straight lines and right angles [judged]

> "Use straight lines and right angles to connect objects wherever possible." (slide 16, under DO)

Flag `layout.routing: spline` or `polyline` in an AWS diagram unless the brief asks for it. Patch: `unset layout.routing`.

## Numbered callouts

### AWS-13 One callout size [measured: `conventions.callout-sizes`]

> "Mix callout sizes within the same diagram." (slide 18, under DON'T)

### AWS-14 Callouts in reading order [measured: `flow.step-order`]

> "Order your numbers as linearly as possible, such as left to right, top to bottom, or clockwise." (slide 18, under DO)

### AWS-15 Callouts placed consistently [judged]

> "Be as consistent as possible in placement of the callouts." (slide 18, under DO)

Steps on edges that run the same way should not alternate between start and end of their edges in a way that makes the order hard to follow; the fix is usually renumbering or reordering nodes, not moving badges.

### AWS-16 Callouts are black with white type [renderer]

> "Callouts are black with bold white type so that they stand out among the colored service and resource icons in the diagram." (slide 18)

## Composition

AWS-17 to AWS-19 are not in the deck; they keep its groups and service tiles readable the way its own examples are.

### AWS-17 Boundary groups name their boundary [measured: `conventions.boundary-label`]

When a group is a real boundary (the AWS Cloud, an account, a Region, an Availability Zone, a VPC, a public or private subnet, an Auto Scaling group, a corporate data center), its label starts with that boundary's name. Context may follow in parentheses, `Private subnet (App tier)`, `Public subnet (Ingress)`, but never replaces it.

The measurement covers `aws:cloud`, `aws:account`, `aws:region`, `aws:az`, `aws:vpc`, `aws:public-subnet`, `aws:private-subnet`, `aws:auto-scaling` and `aws:corporate-dc` groups whose label does not name the boundary at all ("Web subnet" on a private subnet, "Application tier" on a VPC); a Region code (`us-east-1`) names the Region. Judge the order: the functional name leads and context follows in parentheses, except where AWS itself puts a qualifier first ("Log Archive account", "Corporate data center"). A tier with no AWS boundary behind it belongs on `type: aws:generic`. Patch: `set groups.<id>.label` to `Private subnet (Web)`, or `set groups.<id>.type` to `aws:generic`.

### AWS-18 A service group is one service [measured: `conventions.service-group`]

A group framed by one service's icon is that service and holds only its own parts; a box that holds different services is not a service group.

In orrery a service group is a group whose `icon:` is an AWS service icon. The measurement flags one that holds nodes of other AWS services (General icons such as users or servers do not count). The presets that hold other services by the deck's own design (`aws:step-functions`, `aws:ec2-contents`, `aws:elastic-beanstalk`) are not service groups here. Judge what the measurement cannot see: a service group that mixes in another service through a child group or a non-AWS icon. Patch: `unset groups.<id>.icon`, so the group reads as a tier of different services.

### AWS-19 Node labels are official service names [measured: `conventions.service-label`]

A node's label, its first caption line, is the official name of the service its icon shows, so every tile reads as a real AWS service at a glance, with its role underneath in the note.

The measurement covers AWS service icons whose label names the service in no form (full name, the name without "Amazon"/"AWS", initials, catalog alias) and does not open with "Amazon" or "AWS": "Orders function" on `aws:lambda`. A node inside a group of its own service (pods in an Amazon EKS cluster group) is one of its parts and takes a part name. Resource icons (`aws:dynamodb-table`, `aws:simple-storage-service-bucket`) carry resource names as the deck's examples do, and are not covered. Judge the mixed label the measurement accepts: a role fused with a short form ("Settlement Lambda") becomes `label: AWS Lambda` with `note: Settlement handler`. Patch: `set nodes.<id>.label` to the official name and `set nodes.<id>.note` to the role.

Boundaries that are real, actors outside every group and denied paths in red are vendor-neutral: FLOW-11 to FLOW-13 in [flow.md](flow.md).
