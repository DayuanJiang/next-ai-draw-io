# AWS architecture diagrams from text

Describe your system in plain text and Next AI Draw.io draws the AWS architecture diagram with the official AWS icons from draw.io's `aws4` shape library. It is free and open source, and the result is a normal draw.io diagram: edit it by hand and export it as `.drawio`, `.png` or `.svg`. This page shows how to get a good first draft and how to refine it.

## Start from a description

In the editor, describe the system: its parts, and how requests or data move between them. For example:

```text
Draw a serverless REST API on AWS: API Gateway in front of Lambda, Cognito for sign-in, DynamoDB for data and S3 for uploaded files. Put everything except the users inside an AWS Cloud group.
```

The AI looks up the AWS shape library before it draws, so each service gets its real icon rather than a generic box.

What helps:

- **Name the services.** "A database" can become any database; "DynamoDB" becomes the DynamoDB icon.
- **Say what is grouped.** AWS Cloud, Region, VPC, Availability Zones, public and private subnets.
- **Say which way it flows.** For example "left to right, from the users to the database".
- **Ask for animated connectors** when the direction of requests or data matters.

<!-- demo: generate -->

## Start from something you have

- **A screenshot or a whiteboard photo**: upload it and ask the AI to redraw it with AWS icons.
- **A PDF or a design document**: upload it and ask for the architecture it describes.
- **Your infrastructure code**: with the MCP server, Claude Code or Cursor reads your Terraform, CDK or CloudFormation files and draws what they define. See [Use it from Claude Code](./claude-code.md).

```text
Read the Terraform files in infra/ and draw the AWS architecture they create, grouped by VPC and subnet
```

## Refine it

- **Move shapes by hand** where you want them. The AI reads your layout before its next change.
- **Select a service and ask for a change** to it, for example "add a cache in front of this".
- **Undo what went wrong.** Every AI change is a version: undo it from its card, or restore an earlier version.

## Example

![Authentication with React and AWS](../../public/auth.svg)

Prompt: "Generate authentication process using React with AWS. Use Serverless architecture."

## Export

- **.drawio** keeps everything editable, in this app or in draw.io.
- **PNG** is a picture for slides and documents.
- **SVG** is a picture that scales without blur.
