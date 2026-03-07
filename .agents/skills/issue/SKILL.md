Draft a GitHub issue based on the user's description: $ARGUMENTS

1. Infer the appropriate label from the description: `bug`, `enhancement`, `chore`, or `documentation`. Don't ask.
2. Write the issue to `issue.md` in the project root with this format:

```
# Title here

Body here — describe the problem, context, and acceptance criteria.
```

3. Show the user the draft and ask for feedback. Iterate until they're happy.
4. When the user says to create it, run:

```
gh issue create --title "<title>" --body "<body>" --assignee "@me" --label "<label>"
```

5. After creating, delete `issue.md` and confirm with the issue URL.

Keep the writing concise and technical. No fluff.
