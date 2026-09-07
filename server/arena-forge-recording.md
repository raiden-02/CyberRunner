# Record a native ArenaForge demo

Maintainer tool. Visitors never run this.

```powershell
npm run forge:record-native-demo -- --provider openai
```

Uses the current product agent, tools, and budgets. Reads keys from existing server env. Writes `.arena-forge-results/native-demo-candidate.json`. Does not overwrite `server/fixtures/arena-forge/native-designer-demo.json`.

Promote a reviewed candidate after audit:

```powershell
npx tsx --tsconfig server/tsconfig.json server/scripts/promote-native-demo.ts
```

That validates the candidate and writes the committed fixture. It does not change factual agent outputs.
