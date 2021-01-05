import { Task } from '@serenity-js/core';
import { ExecuteScript, Target } from '@serenity-js/protractor';

/*
export const DragAndDrop = (draggable) => ({
    onto: (dropzone) => Interaction.where(
        `#actor drags ${draggable} onto ${dropzone}`,
        actor => {
            const browse           = BrowseTheWeb.as(actor),
                  draggableElement = browse.locate(draggable),
                  dropzoneElement  = browse.locate(dropzone);

            return browse.actions().
                dragAndDrop(draggableElement, dropzoneElement).
                perform();
    })
})

*/

const dragAndDropScript = require('html-dnd').code; // tslint:disable-line:no-var-requires

export const DragAndDrop = (draggable: Target) => ({
    onto: (dropzone: Target) => Task.where(`#actor drags ${draggable} onto ${dropzone}`,
        ExecuteScript.sync(dragAndDropScript).withArguments(draggable, dropzone),
    ),
});
