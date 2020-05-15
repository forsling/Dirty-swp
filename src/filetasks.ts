import * as vscode from 'vscode';
import * as fs from "fs";
import { swpString, fullSwpString } from './extension';
import { DsDocument, swpFile } from './types';
import { warn } from './display';

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
            fs.writeFileSync(dsDoc.swapPath, fullSwpString);
            dsDoc.hasOurSwp = true;
            console.log("Written swp: " + dsDoc.swapPath);
            return true;
        } catch (err) {
            dsDoc.hasOurSwp = false;
            console.log("Writing swp failed: " + dsDoc.swapPath);
            return false;
        }
    });
}


export { checkSwp, tryLockFile };