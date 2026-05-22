Follow the following rules:

1. When running tests in a `pnpm` workspace, always run tests, or any other commands that may touch external files (tests may use testcontainers which in turn uses Docker) in an elevated shell.

2. When generating a commit message or a PR title, always use the rules defined in the Git Committer skill.
