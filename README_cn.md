这是我的最新文章[No Plugins Needed, I Built a Fully Automated Coding Loop in OpenCode](https://www.dataleadsfuture.com/no-plugins-needed-i-built-a-fully-automated-coding-loop-in-opencode/)的源代码。

中文用户请切到`feature/version-cn`分支，获取原生中文源码。

以`test/`开头的几个分支是我在OpenCode下使用`/goal`命令做的测试。

使用方法：
1. 将`.opencode/commands/`和`.opencode/agents/`下的文件分别复制到`~/.config/opencode/commands/`和`~/.config/opencode/agents/`目录下，重启OpenCode。
2. 或者直接将`.opencode/`整个目录直接复制到你的项目根目录下，重启OpenCode。
3. 或者使用`git clone`命令将代码库克隆到本地，然后在代码目录启动OpenCode，测试`/goal`命令。