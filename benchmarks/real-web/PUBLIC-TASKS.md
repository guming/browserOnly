# Public tasks: jobs 08–10

All ten tasks in suite 3.0.0 use public pages and require no account or manual sign-in. Prompts and JSON answer contracts are English.

- 08 Project Gutenberg: find an English edition of Frankenstein, verify catalog metadata and copyright, and open its online reading format.
- 09 NASA: find the latest five dated official news releases, open each source, and summarize their contents and themes.
- 10 Google Maps: verify the British Museum address and compare public transport routes from King's Cross using one consistent observation.

Run all tasks:

```sh
node --env-file=.env.local scripts/benchmark/run-real-web.mjs --all
```

No `--login` flag is needed. Consent prompts or access restrictions can still occur; record restrictions rather than bypassing them. Jobs 08–10 collect answers, evidence and timing but require independent manual review; Agent completion alone does not establish correctness. Public page availability does not establish that a full Agent run has passed.

Historical runs preserve their original task definitions in their snapshots. Replacing a task does not reinterpret older Gmail or X results.
