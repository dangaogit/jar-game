package java.util;

public class Date {
    private long time;

    public Date() {
        this(System.currentTimeMillis());
    }

    public Date(long date) {
        time = date;
    }

    public long getTime() {
        return time;
    }

    public void setTime(long time) {
        this.time = time;
    }

    public boolean equals(Object obj) {
        return obj instanceof Date && ((Date) obj).time == time;
    }

    public int hashCode() {
        return (int) time ^ (int) (time >> 32);
    }

    public String toString() {
        return String.valueOf(time);
    }
}
