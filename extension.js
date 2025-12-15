const vscode = require("vscode");
const { exec } = require("child_process");
const fetch = require("node-fetch");

let watcher = null;
let isRunning = false;

function activate(context) {
    const output = vscode.window.createOutputChannel("AutoPush");

    // Start
    let startCmd = vscode.commands.registerCommand("autopush.start", async function () {
        const token = await context.secrets.get("github_token");
        if (!token) {
            vscode.window.showErrorMessage("Set GitHub Token first using: AutoPush: Set GitHub Token");
            return;
        }

        const repoName = await vscode.window.showInputBox({ prompt: "Enter GitHub repository name" });
        if (!repoName) return;

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage("No workspace folder open");
            return;
        }
        const cwd = workspaceFolder.uri.fsPath;

        const username = await getUser(token);

        output.appendLine(`Creating repo: ${username}/${repoName}`);

        await createRepo(token, repoName);

        exec(`git init`, { cwd }, () => {
            exec(`git remote add origin https://github.com/${username}/${repoName}.git`, { cwd }, () => {
                exec(`git add .`, { cwd }, () => {
                    exec(`git commit -m "Initial commit"`, { cwd }, (err) => {
                        if (!err) {
                            exec(`git push -u origin main`, { cwd });
                        }
                    });
                });
            });
        });

        vscode.window.showInformationMessage("AutoPush Started");
        isRunning = true;

        watcher = vscode.workspace.createFileSystemWatcher("**/*");
        watcher.onDidChange(() => push(output, cwd));
        watcher.onDidCreate(() => push(output, cwd));
        watcher.onDidDelete(() => push(output, cwd));
    });

    // Stop
    let stopCmd = vscode.commands.registerCommand("autopush.stop", function () {
        vscode.window.showInformationMessage("AutoPush Stopped");
        isRunning = false;
        if (watcher) watcher.dispose();
    });

    // Set Token
    let tokenCmd = vscode.commands.registerCommand("autopush.setToken", async function () {
        const token = await vscode.window.showInputBox({ prompt: "Enter your GitHub Personal Access Token", password: true });
        if (token) {
            await context.secrets.store("github_token", token);
            vscode.window.showInformationMessage("GitHub Token Saved Successfully!");
        }
    });

    context.subscriptions.push(startCmd, stopCmd, tokenCmd);
}

async function getUser(token) {
    const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `token ${token}` }
    });
    const data = await res.json();
    return data.login;
}

async function createRepo(token, name) {
    await fetch("https://api.github.com/user/repos", {
        method: "POST",
        headers: {
            Authorization: `token ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ name })
    });
}

function push(output, cwd) {
    if (!isRunning) return;

    exec(`git add . && git commit -m "Auto update" && git push`, { cwd },
        (err, stdout, stderr) => {
            if (err) output.appendLine("Push error: " + err);
        }
    );
}

function deactivate() {}

module.exports = { activate, deactivate };
// fvn