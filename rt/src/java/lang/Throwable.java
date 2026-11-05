package java.lang;

public class Throwable {
    private String detailMessage;

    public Throwable() {
        fillInStackTrace();
    }

    public Throwable(String message) {
        detailMessage = message;
        fillInStackTrace();
    }

    private native void fillInStackTrace();

    public String getMessage() {
        return detailMessage;
    }

    public String toString() {
        String name = getClass().getName();
        return detailMessage != null ? name + ": " + detailMessage : name;
    }

    public native void printStackTrace();
}
