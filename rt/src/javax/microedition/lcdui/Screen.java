package javax.microedition.lcdui;

import jargame.Host;

public abstract class Screen extends Displayable {
    Screen() {
    }

    /** pushes the current screen model to the host overlay */
    abstract void $showOnHost();

    /** receives edited values back from the host before a command is dispatched */
    void $applyTexts(String[] texts) {
    }

    void $command(int index, int arg) {
        String[] texts = Host.screenTexts();
        if (texts != null) {
            $applyTexts(texts);
        }
        $fireCommand(index);
    }
}
