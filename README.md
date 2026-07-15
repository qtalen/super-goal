This is the source code for my latest article [No Plugins Needed, I Built a Fully Automated Coding Loop in OpenCode](https://www.dataleadsfuture.com/no-plugins-needed-i-built-a-fully-automated-coding-loop-in-opencode/).

The branches starting with `test/` are tests I ran using the `/goal` command in OpenCode.

I used both the `deepseek-v4-pro` and `deepseek-v4-flash` models. If you want to switch to a different model, just remember to update it in the `frontmatter` of `goal-orch.md` and `goal-worker.md`.

Usage:
1. Copy the files under `.opencode/commands/` and `.opencode/agents/` to `~/.config/opencode/commands/` and `~/.config/opencode/agents/` respectively, then restart OpenCode.
2. Or copy the entire `.opencode/` directory directly to your project root, then restart OpenCode.
3. Or use `git clone` to clone the repo locally, launch OpenCode in the project directory, and test the `/goal` command.
