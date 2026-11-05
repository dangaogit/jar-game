package java.util;

/** Fixed-offset time zones only (no daylight saving), as on most CLDC devices. */
public abstract class TimeZone {
    private static TimeZone defaultZone;

    public TimeZone() {
    }

    public abstract int getOffset(int era, int year, int month, int day, int dayOfWeek, int millis);

    public abstract int getRawOffset();

    public abstract boolean useDaylightTime();

    public String getID() {
        return null;
    }

    public static synchronized TimeZone getTimeZone(String id) {
        if (id == null) {
            throw new NullPointerException();
        }
        if (id.equals("GMT") || id.equals("UTC")) {
            return new FixedZone(id, 0);
        }
        if ((id.startsWith("GMT+") || id.startsWith("GMT-")) && id.length() > 4) {
            try {
                String rest = id.substring(4);
                int colon = rest.indexOf(':');
                int hours = Integer.parseInt(colon < 0 ? rest : rest.substring(0, colon));
                int minutes = colon < 0 ? 0 : Integer.parseInt(rest.substring(colon + 1));
                int offset = (hours * 60 + minutes) * 60000;
                return new FixedZone(id, id.charAt(3) == '-' ? -offset : offset);
            } catch (NumberFormatException e) {
                return new FixedZone("GMT", 0);
            }
        }
        if (id.equals("Asia/Shanghai") || id.equals("Asia/Chongqing") || id.equals("CTT") || id.equals("PRC")) {
            return new FixedZone(id, 8 * 3600000);
        }
        return new FixedZone("GMT", 0);
    }

    public static synchronized TimeZone getDefault() {
        if (defaultZone == null) {
            defaultZone = new FixedZone("GMT+08:00", 8 * 3600000);
        }
        return defaultZone;
    }

    public static String[] getAvailableIDs() {
        return new String[] {"GMT", "UTC", "Asia/Shanghai"};
    }

    static final class FixedZone extends TimeZone {
        private final String id;
        private final int offset;

        FixedZone(String id, int offset) {
            this.id = id;
            this.offset = offset;
        }

        public int getOffset(int era, int year, int month, int day, int dayOfWeek, int millis) {
            return offset;
        }

        public int getRawOffset() {
            return offset;
        }

        public boolean useDaylightTime() {
            return false;
        }

        public String getID() {
            return id;
        }
    }
}
