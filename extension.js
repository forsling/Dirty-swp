// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const swpString = "VSCODE/" + vscode.env.machineId;
let documents = {};
let swpStatusBar;
let active = true;

function DocumentInfo(document) {
    let self = this;
    let filePath = document.uri.fsPath;
    let folder = path.dirname(filePath);
    let basename = path.basename(filePath);

    this.document = document;
    this.basename = basename;
    this.swapPath = path.join(folder, "." + basename + ".swp");
    this.hasOurSwp = false;
    this.forceLock = false;

    //If the file has been in use by someone else while dirty,
    //then there may be unimported changes on disk that risk being overwritten
    this.potentialUnsyncedChanges = false;

    this.removeOwnSwp = function() {
        if (self.hasOurSwp) {
            self.hasOurSwp = false;
            fs.unlinkSync(self.swapPath);
            return true;
        } else {
            return false;
        }
    }
}

function hasSwp(DocInfo, hasSwpCallback, noSwpCallback) {
    fs.stat(DocInfo.swapPath, (err, stats) => {
        if (err) {
            if (err.code === 'ENOENT') {
                noSwpCallback();
            } else {
                vscode.window.showErrorMessage("Dirty .swp error: " + err.message)
            }
        } else {
            hasSwpCallback(stats);
        }
    })
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    active = vscode.workspace.getConfiguration().get('dirtyswp.startActive');
    
    let openDocumentListener = vscode.workspace.onDidOpenTextDocument(e => {
        if (!active || e.uri.scheme != "file") {
            return;
        }
        
        //create DocumentInfo object and add it to documents
        let docinfo = new DocumentInfo(e);
        documents[docinfo.document.uri] = docinfo;

        //warn user if file is being edited somewhere else
        hasSwp(docinfo, () => {
            vscode.window.showWarningMessage(docinfo.basename + " is in use somewhere else (.swp file exists)")
        })
        console.log(documents);
    })

    let closeDocumentListener = vscode.workspace.onDidCloseTextDocument(e => {
        if (!active || e.uri.scheme != "file") {
            return;
        }

        let doc = documents[e.uri];
        //If there is a swap file that we created, remove it on document close
        doc.removeOwnSwp();

        delete documents[e.uri];
        console.log(documents);
    })

    let documentChangedListener = vscode.workspace.onDidChangeTextDocument(e => {
        if (!active || e.document.uri.scheme != "file") {
            return;
        }

        let doc = documents[e.document.uri];
        if (doc.document.isDirty) {
            tryLockFile(doc)
        } 
        else if (doc.hasOurSwp && !doc.forceLock) {
            //if file is no longer dirty but still has our swp, then we can remove the .swp file unless forcelock is set
            doc.removeOwnSwp();
        }
    })

    //on startup, add any already opened documents
    addOpenDocuments();

    context.subscriptions.push(openDocumentListener);
    context.subscriptions.push(closeDocumentListener);
    context.subscriptions.push(documentChangedListener);

    context.subscriptions.push(vscode.commands.registerCommand('dirtyswp.start', () => {
        if (active) {
            vscode.window.showInformationMessage("Dirty swp is already active");
            return
        }
        vscode.window.showInformationMessage("Turning on .swp support");
        active = true;
        addOpenDocuments(true);
        swpStatusBar.show();
    }));
    
    context.subscriptions.push(vscode.commands.registerCommand('dirtyswp.stop', () => {
        if (!active) {
            vscode.window.showInformationMessage("Dirty swp is already inactive");
            return
        }
        vscode.window.showInformationMessage("Turning off .swp support");
        swpStatusBar.hide();
        deactivate();
    }));
    
    context.subscriptions.push(vscode.commands.registerCommand('dirtyswp.forcelock', () => {
        let name = vscode.window.activeTextEditor.document.uri;
        let docinfo = documents[name];
        docinfo.forceLock = true;
        tryLockFile(docinfo)
    }));

    context.subscriptions.push(vscode.commands.registerCommand('dirtyswp.listswp', () => {
        let files = [];
        let activeEditor = vscode.window.activeTextEditor;

        if (activeEditor && activeEditor.document.uri.scheme == "file") {
            let currentDocKey = vscode.window.activeTextEditor.document.uri;
            let currentDoc = documents[currentDocKey];

            if (currentDoc && currentDoc.hasOurSwp && !currentDoc.forceLock) {
                files.push({
                    label: "Lock current file until close", 
                    action: () => {
                        vscode.commands.executeCommand("dirtyswp.forcelock");
                    }
                })
            }
        }

        Object.entries(documents).forEach(entry => {
            let doc = entry[1];
            console.log(doc);
            let description;
            if (doc.hasOurSwp) {
                description = doc.forceLock ? "Locked by us (until close)" : "Locked by us (dirty)";
            } else {
                try {
                    fs.statSync(doc.swapPath);
                    description = "WARNING: Locked by other party";
                }
                catch (e) {
                    return;
                }                
            }

            files.push({
                "label": doc.document.fileName, 
                "description": description, 
                action: () => {
                    vscode.window.showTextDocument(doc.document);
                }
            });
        })

        vscode.window.showQuickPick(files)
        .then((val) => {
            console.log(val);
            if (val && val.action) {
                val.action();
            }
        })

    }));

    swpStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    context.subscriptions.push(swpStatusBar);
    swpStatusBar.text = ".swp"
    swpStatusBar.command = "dirtyswp.listswp"
    swpStatusBar.show();
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
    for (let doc of Object.keys(documents)) {
        documents[doc].removeOwnSwp();
    }
    documents = {};
    active = false;
}
exports.deactivate = deactivate;

function tryLockFile(docinfo, resultCallback = (res) => {}) {
    //if the file is locked by us then editing is fine and nothing else needs to be done
    if (docinfo.hasOurSwp) {
        resultCallback(true);
        return;
    }
    
    //if the file has a swp here then somebody else is editing it
    hasSwp(docinfo,
        () => {
            vscode.window.showWarningMessage(docinfo.basename + " is in use someplace else: If you save your changes you may overwrite somebody elses!", 'Open Dialog', 'Save As Dialog')
            .then((choice) => showDialog(choice));
            resultCallback(false);
        }, () => {
            //if there is no current swp but the file is dirty we should lock it for ourselves
            try {
                fs.writeFileSync(docinfo.swapPath, swpString);
                docinfo.hasOurSwp = true;
                console.log("Written swp: " + docinfo.swapPath);
                return true;
            } catch (err) {
                docinfo.hasOurSwp = false;
                console.log("Writing swp failed: " + docinfo.swapPath);
                return false;
            }
        }
    );
}

function addOpenDocuments(createSwpIfDirty = false) {
    console.log(vscode.workspace.textDocuments);
    console.log(vscode.window.visibleTextEditors);
    vscode.workspace.textDocuments.forEach((openDocument) => {
        if (openDocument.uri.scheme != "file") {
            return
        }
        let docinfo = new DocumentInfo(openDocument)
        documents[docinfo.document.uri] = docinfo;
        if (createSwpIfDirty && docinfo.document.isDirty) {
            tryLockFile(docinfo)
        }

        if (!docinfo.hasOurSwp) {
            hasSwp(docinfo, () => {
                vscode.window.showWarningMessage(docinfo.basename + " is in use somewhere else (.swp file exists)")
            })
        }
    })
}

function showDialog(choice) {
    if (choice == 'Open Dialog') {
        vscode.window.showOpenDialog({});
    }
    else if (choice == 'Save As Dialog') {
        vscode.window.showSaveDialog({});
    }
} 
