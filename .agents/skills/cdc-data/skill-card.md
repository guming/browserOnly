## Description: <br>
Locates, verifies, optionally downloads, and extracts official China CDC influenza weekly reports, respiratory surveillance reports, COVID-19 monthly updates, and infectious-disease risk assessment reports from registered China CDC sources. <br>

This skill is ready for commercial/non-commercial use. <br>

## Publisher: <br>
[miaoshou.dev](https://clawhub.ai/user/miaoshou.dev) <br>

### License/Terms of Use: <br>
MIT-0 <br>


## Use Case: <br>
Developers, analysts, and public-health researchers use this skill to find official China CDC report pages or PDFs, verify source identity, download requested PDFs, and extract report text, tables, metadata, and comparable metrics. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: The skill opens China CDC pages and downloads verified PDFs when requested. <br>
Mitigation: Run it in an environment where access to www.chinacdc.cn is permitted, and keep URL allowlists restricted to the registered China CDC paths. <br>
Risk: The skill can run included Python helper scripts and write report artifacts locally. <br>
Mitigation: Review the scripts before deployment and use a dedicated writable artifact directory for downloaded PDFs and extracted JSON. <br>
Risk: Extracted public-health report content could be mistaken for clinical guidance. <br>
Mitigation: Use outputs as source retrieval and extraction results only; review public-health interpretation separately and do not treat the skill as medical advice. <br>


## Reference(s): <br>
- [ClawHub Skill Page](https://clawhub.ai/miaoshou.dev/skills/cdc-data) <br>
- [China CDC Official Site](https://www.chinacdc.cn/) <br>
- [Source Registry](references/source-registry.md) <br>
- [Workflow](references/workflow.md) <br>
- [Output Protocol](references/output-schema.md) <br>
- [Artifact Storage](references/artifact-schema.md) <br>
- [Matching and Time Rules](references/matching-rules.md) <br>
- [PDF Extraction Rules](references/pdf-extraction-rules.md) <br>


## Skill Output: <br>
**Output Type(s):** [Text, JSON, Files, Shell commands, Guidance] <br>
**Output Format:** [Concise text responses with optional JSON extraction artifacts and downloaded PDF files] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [May include verified official URLs, report metadata, warnings, saved local paths, and permitted next actions.] <br>

## Skill Version(s): <br>
1.0.1 (source: server release metadata) <br>

## Ethical Considerations: <br>
Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment. <br>
