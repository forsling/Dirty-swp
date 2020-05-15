import * as vscode from 'vscode';
import { DsDocument, swpFile, DsDocArray } from './types';
import { checkSwp, tryLockFile } from './filetasks';
import * as ds from './display';
import * as fs from 'fs';

const swpString: string = "VSCODE/" + vscode.env.machineId;
let fullSwpString: string = swpString;
let DsDocs: DsDocArray = {};
let swpStatusBar: vscode.StatusBarItem;
let active: boolean = true;

export function activate(context: vscode.ExtensionContext) {
	let swpName: string = vscode.workspace.getConfiguration().get('dirtyswp.writeNameToSwp') || "";
	if (typeof swpName != 'undefined' && swpName) {
		fullSwpString = swpString + ":" + swpName;
	}

	active = vscode.workspace.getConfiguration().get('dirtyswp.startActive') || true;
	let statusBarEnabled = vscode.workspace.getConfiguration().get('dirtyswp.showStatusBarItem');

	let openDocumentListener = vscode.workspace.onDidOpenTextDocument(e => {
		if (!active || e.uri.scheme != "file") {
			return;
		}

		//create DocumentInfo object and add it to documents
		let dsDoc = new DsDocument(e);
		DsDocs[e.uri.toString()] = dsDoc;

		//warn user if file is being edited somewhere else
		checkSwp(dsDoc, (swp) => {
			ds.warn(dsDoc.basename, false, swp);
		}, () => { });
		console.log(DsDocs);
	});

	let closeDocumentListener = vscode.workspace.onDidCloseTextDocument(e => {
		if (!active || e.uri.scheme != "file") {
			return;
		}

		let doc = DsDocs[e.uri.toString()];
		//If there is a swap file that we created, remove it on document close
		doc.removeOwnSwp();

		delete DsDocs[e.uri.toString()];
		console.log(DsDocs);
	});

	let documentChangedListener = vscode.workspace.onDidChangeTextDocument(e => {
		if (!active || e.document.uri.scheme != "file") {
			return;
		}

		let test = e.document.uri.toString();
		let doc = DsDocs[e.document.uri.toString()];
		if (!doc.textDocument.isDirty) { //file has no unsaved changes
			doc.potentialUnsyncedChanges = false;
			if (doc.hasOurSwp && !doc.forceLock) {
				//if file is no longer dirty but still has our swp, then we can remove the .swp file (unless 'lock until close' is set)
				doc.removeOwnSwp();
			}
		}
		else if (!doc.hasOurSwp) { //file has unsaved changes but is not locked by us
			checkSwp(doc, (swp) => {
				doc.potentialUnsyncedChanges = true;
				ds.warn(doc.basename, true, swp);
			}, () => {
				if (doc.potentialUnsyncedChanges) {
					//even if the file is no longer in use by someone else, there may still be changes that have not been loaded (since file is dirty)
					vscode.window.showWarningMessage(doc.basename + " is no longer being edited elsewhere but may have unsynced changes: Save may overwrite changes!", 'Open Dialog', 'Save As Dialog')
						.then((choice) => ds.showDialog(choice));
				} else {
					//if the file is not currently locked and has no potential unloaded changes, then we may lock the file for ourselves
					try {
						fs.writeFileSync(doc.swapPath, fullSwpString);
						doc.hasOurSwp = true;
					} catch (err) {
						vscode.window.showErrorMessage("Writing .swp failed: " + err);
					}
				}
			});
		}
	});

	let confChangedListener = vscode.workspace.onDidChangeConfiguration((e) => {
		let statusbarAffected = e.affectsConfiguration('dirtyswp.showStatusBarItem');
		if (statusbarAffected) {
			statusBarEnabled = vscode.workspace.getConfiguration().get('dirtyswp.showStatusBarItem');
			if (statusBarEnabled) {
				swpStatusBar.show();
			} else {
				swpStatusBar.hide();
			}
		}
	});
	context.subscriptions.push(confChangedListener);

	//on startup, add any already opened documents
	addOpenDocuments();

	context.subscriptions.push(openDocumentListener);
	context.subscriptions.push(closeDocumentListener);
	context.subscriptions.push(documentChangedListener);

	context.subscriptions.push(vscode.commands.registerCommand('dirtyswp.start', () => {
		if (active) {
			vscode.window.showInformationMessage("Dirty.swp is already active");
			return
		}
		vscode.window.showInformationMessage("Resuming .swp monitoring and locking");
		active = true;
		addOpenDocuments(true);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('dirtyswp.stop', () => {
		if (!active) {
			vscode.window.showInformationMessage("Dirty.swp is already paused");
			return
		}
		vscode.window.showInformationMessage("Pausing .swp monitoring and locking.");
		deactivate();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('dirtyswp.lockuntilclose', () => {
		if (typeof vscode.window.activeTextEditor === 'undefined') {
			return;
		}
		let name = vscode.window.activeTextEditor.document.uri.toString();
		let dsDoc = DsDocs[name];
		dsDoc.forceLock = true;
		tryLockFile(dsDoc)
	}));

	context.subscriptions.push(vscode.commands.registerCommand('dirtyswp.listswp', ds.listSwp));

	swpStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    context.subscriptions.push(swpStatusBar);
    swpStatusBar.text = ".swp";
    swpStatusBar.command = "dirtyswp.listswp";
    if (statusBarEnabled) {
        swpStatusBar.show();
    }
    context.subscriptions.push(swpStatusBar);
}

function addOpenDocuments(createSwpIfDirty = false) {
    vscode.workspace.textDocuments.forEach((openDocument) => {
        if (openDocument.uri.scheme != "file") {
            return
        }
        let docinfo = new DsDocument(openDocument)
        DsDocs[docinfo.textDocument.uri.toString()] = docinfo;
        if (createSwpIfDirty && docinfo.textDocument.isDirty) {
            tryLockFile(docinfo);
        }

        if (!docinfo.hasOurSwp) {
			checkSwp(docinfo, (swp) => {
				ds.warn(docinfo.basename, false, swp);
			}, () => {});
        }
    })
}

// this method is called when your extension is deactivated
export function deactivate() { 
	for (let doc of Object.keys(DsDocs)) {
        DsDocs[doc].removeOwnSwp();
    }
    DsDocs = {};
    active = false;
}
export { DsDocs, active, swpString, fullSwpString };
