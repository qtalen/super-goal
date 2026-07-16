This is the source code for my latest article [No Plugins Needed, I Built a Fully Automated Coding Loop in OpenCode](https://www.dataleadsfuture.com/no-plugins-needed-i-built-a-fully-automated-coding-loop-in-opencode/).

The branches starting with `test/` are tests I ran using the `/goal` command in OpenCode.

I used both the `deepseek-v4-pro` and `deepseek-v4-flash` models. If you want to switch to a different model, just remember to update it in the `frontmatter` of `goal-orch.md` and `goal-worker.md`.

Usage:
1. Copy the files under `.opencode/commands/` and `.opencode/agents/` to `~/.config/opencode/commands/` and `~/.config/opencode/agents/` respectively, then restart OpenCode.
2. Or copy the entire `.opencode/` directory directly to your project root, then restart OpenCode.
3. Or use `git clone` to clone the repo locally, launch OpenCode in the project directory, and test the `/goal` command.

---

## Some demo showcases of how it works in action
### 1. Write a Fibonacci script
This test checks whether the agent picks the best algorithm. The prompt is:

```Markdown
/goal Write a Fibonacci calculation script with the best possible performance.
```

![What's pretty cool is that DeepSeek went with a fast doubling algorithm, and it's incredibly performant. ](https://storage.ghost.io/c/33/67/33678c00-2c15-4961-93e9-497b427e2006/content/images/2026/07/image-3.png)

### 2. Build a Tower of Hanoi web game
Everyone knows this game. You could honestly just prompt an LLM directly and get it built. But that predictability is exactly what makes it useful for testing whether each step of the coding loop is working correctly.

```Markdown
/goal Build a playable Tower of Hanoi web game.
```

![The Towers of Hanoi game built using the /goal command comes with a built-in AI solver.](https://storage.ghost.io/c/33/67/33678c00-2c15-4961-93e9-497b427e2006/content/images/2026/07/hanoi_tower.gif)

### 3. Build a chess web game
Maybe you are not impressed by the Tower of Hanoi example, since a regular prompt to any frontier model can do the same thing without a coding loop. Fair. The chess game experiment is something you should actually try for yourself.

```Markdown
/goal Build a playable chess web game. 
Include easy, medium, and hard difficulty levels. 
No online multiplayer needed. 
Use a Python backend as the AI engine.
```

![A full-stack chess game with both frontend and backend, built using the /goal command.](https://storage.ghost.io/c/33/67/33678c00-2c15-4961-93e9-497b427e2006/content/images/2026/07/web_chess.gif)

### 4. A typing practice game for kids

```Markdown
/goal I want to build a typing practice web app for kids. 
At the bottom of the screen are 9 keys representing the positions of 10 fingers, with the thumbs sharing a wider spacebar key that takes up two slots. 
Above those 9 keys is a gradient-transparent rectangle. 
Letters fall down from the top toward that rectangle, aligned to their matching key positions. 
Press the right key as the letter enters the zone and it counts as a hit, triggering a hit effect. 
Consecutive correct hits build up increasingly dramatic effects. 
The falling speed gradually increases. 
At the top of the screen is a scoreboard that adds 1 point for each hit, with a pop animation. 
The whole thing should feel exciting and dopamine-triggering, with plenty of visual encouragement.
```

![A typing mini-game created with /goal command.](https://storage.ghost.io/c/33/67/33678c00-2c15-4961-93e9-497b427e2006/content/images/size/w1000/2026/07/typing-game.gif)