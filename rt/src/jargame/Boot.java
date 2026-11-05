package jargame;

import javax.microedition.lcdui.Display;
import javax.microedition.midlet.MIDlet;

public final class Boot {
    private Boot() {
    }

    public static void main(String[] args) {
        String className = args[0];
        MIDlet midlet;
        try {
            midlet = (MIDlet) Class.forName(className).newInstance();
        } catch (Throwable t) {
            System.err.println("Cannot instantiate MIDlet " + className);
            t.printStackTrace();
            return;
        }
        Display.$run(midlet);
    }
}
