// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
//const fs = require('fs');


function activate(context) {
    let watchers = [];
    let channel = vscode.window.createOutputChannel('relative');
    context.subscriptions.push(channel);

    channel.appendLine(`New output channel`);

    vscode.window.onDidChangeActiveTextEditor(e => { 
        console.log(e.document.uri.fsPath)
        //console.log(e._documentData._uri.fsPath);
    });

    let disposable = vscode.commands.registerCommand('relative.startFileWatchers', () => {
        channel.show(true);
        //let folders = vscode.workspace.workspaceFolders;

        var activePath = vscode.window.activeTextEditor.document.uri.fsPath;
        var basePath = vscode.workspace.rootPath;
        console.log("Rootpath: " + basePath);

        var currentPath = activePath.substring((0), activePath.lastIndexOf('\\') + 1);
        var currentFile = activePath.substring(activePath.lastIndexOf('\\') + 1, activePath.length - 1);
        var currentFileName = currentFile.substring(0, currentFile.lastIndexOf('.'));
        console.log("Current file: " + currentFile);

        let pattern = new vscode.RelativePattern(currentPath, (currentFileName + '.swp'));
        console.log(pattern);

        let watcher = vscode.workspace.createFileSystemWatcher(pattern);
        watcher.onDidCreate((event) => {
            channel.appendLine(`Watcher 1: ${event.fsPath}`);
            vscode.window.showWarningMessage('This file is being edited in vim!')
            vscode.window.showSaveDialog({});
        });
        watchers.push(watcher);

        watcher = vscode.workspace.createFileSystemWatcher(pattern);
        watcher.onDidDelete((event) => {
            channel.appendLine(`Watcher 2: ${event.fsPath}`);
            vscode.window.showInformationMessage('This file is no longer being edited')
        });
        watchers.push(watcher);

        watcher = vscode.workspace.createFileSystemWatcher('**/*.swp');
        watcher.onDidCreate((event) => { channel.appendLine(`Watcher 3: ${event.fsPath}`); })
        watchers.push(watcher);
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('relative.stopFileWatchers', () => {
       watchers.forEach(e => e.dispose());
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.sayHello', () => {
        vscode.window.showInformationMessage('Extension has loaded for sure!');
        console.log(watchers);
     });
     context.subscriptions.push(disposable);
}

exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;