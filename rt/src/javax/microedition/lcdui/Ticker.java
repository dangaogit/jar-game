package javax.microedition.lcdui;

public class Ticker {
    private String string;

    public Ticker(String str) {
        string = str;
    }

    public void setString(String str) {
        string = str;
    }

    public String getString() {
        return string;
    }
}
