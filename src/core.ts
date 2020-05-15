import * as vscode from 'vscode';
import * as fs from "fs";
import * as ds from './display';
import { DsDocument, DsDocArray, swpFile } from './types';
import { warn } from './display';

const swpString: string = "VSCODE/" + vscode.env.machineId;
let DsDocs: DsDocArray = {};

let checkSwp = function(dsDoc: DsDocument, hasOthersSwpCallback: (swp: swpFile) => void, noSwpCallback: () => void) {
    fs.stat(dsDoc.swapPath, (err, stats) => {
        if (err) {
            if (err.code === 'ENOENT') {
                noSwpCallback();
            } else {
                vscode.window.showErrorMessage("Dirty .swp error: " + err.message)
            }
        } else {
            if (stats.size > 5000) {
                //Must be other .swp as we would never create a .swp this big
                hasOthersSwpCallback(new swpFile("OTHER"));
            } else {
                //Check if it isn't our swp after all, could be from a lost session
                fs.readFile(dsDoc.swapPath, "utf-8", (err, data) => {
                    let firstPart: string = data.split(":")[0];
                    if (!err && firstPart === swpString) {
                        console.log("Reclaimed own .swp at " + dsDoc.swapPath);
                        dsDoc.hasOurSwp = true; 
                    } else {
                        var swp = new swpFile(data);
                        hasOthersSwpCallback(swp);
                    }
                });
            }
        }
    })
}

let tryLockFile = function(dsDoc: DsDocument) {
    //if the file is locked by us then editing is fine and nothing else needs to be done
    if (dsDoc.hasOurSwp) {
        return;
    }
    checkSwp(dsDoc, (swp) => {
        warn(dsDoc.basename, true, swp);
    }, () => {
        //if there is no current swp but the file is dirty we should lock it for ourselves
        try {
            fs.writeFileSync(dsDoc.swapPath, getFullSwpString());
            dsDoc.hasOurSwp = true;
            console.log("Written swp: " + dsDoc.swapPath);
            return true;
        } catch (err) {
            dsDoc.hasOurSwp = false;
            vscode.window.showErrorMessage("Writing .swp failed: " + err);
            return false;
        }
    });
}

const addOpenDocuments = function(createSwpIfDirty = false) {
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

let emptyDocs = function() {
    DsDocs = {};
}

let getFullSwpString = function() {
    let swpName: string = vscode.workspace.getConfiguration().get('dirtyswp.writeNameToSwp') || "";
    if (swpName) {
        return swpString + ":" + swpName;
    }
    return swpString;
}

export { DsDocs, emptyDocs, swpString, getFullSwpString, checkSwp, tryLockFile, addOpenDocuments };