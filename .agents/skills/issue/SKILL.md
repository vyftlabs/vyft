Draft a GitHub issue based on the user's description: $ARGUMENTS

1. Infer the issue **type** (one of: `bug`, `feature`, `task`) and the appropriate **label** from the description. Don't ask.
2. Write a short, direct issue body — just explain what needs to happen and why. No templates, no "Acceptance Criteria" headers, no checkbox lists. Write it like you'd explain it to a teammate.
3. **Title** must use conventional commit format: `<type>(<scope>): <description>` (e.g., `ci: automate package publishing on tag push`, `feat(engine): add recursive diff support`). Types: `feat`, `fix`, `docs`, `chore`, `ci`, `refactor`, `test`, `perf`. Scope is optional.
4. Show the user the draft (title + body + type) and ask for feedback. Iterate until they're happy.
5. When the user says to create it, run:

```
gh issue create --title "<title>" --body "<body>" --assignee "@me" --label "<label>"
```

6. Set the issue type using GraphQL. Issue type IDs:
   - Bug: `IT_kwDODkus7s4BwjYb`
   - Feature: `IT_kwDODkus7s4BwjYc`
   - Task: `IT_kwDODkus7s4BwjYa`

```
gh api graphql -f query='mutation { updateIssue(input: { id: "<issue_node_id>", issueTypeId: "<type_id>" }) { issue { id } } }'
```

To get the issue node ID, run: `gh issue view <number> --json id -q .id`

7. Add the issue to the **Vyft** project and set the milestone:

```
gh issue edit <number> --milestone "v0.1"
gh project item-add 5 --owner vyftlabs --url <issue_url>
```

8. Confirm with the issue URL.

Keep the writing concise and technical. No fluff.
