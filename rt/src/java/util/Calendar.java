package java.util;

/** Gregorian calendar with the CLDC field set. */
public abstract class Calendar {
    public static final int ERA = 0;
    public static final int YEAR = 1;
    public static final int MONTH = 2;
    public static final int WEEK_OF_YEAR = 3;
    public static final int WEEK_OF_MONTH = 4;
    public static final int DATE = 5;
    public static final int DAY_OF_MONTH = 5;
    public static final int DAY_OF_YEAR = 6;
    public static final int DAY_OF_WEEK = 7;
    public static final int DAY_OF_WEEK_IN_MONTH = 8;
    public static final int AM_PM = 9;
    public static final int HOUR = 10;
    public static final int HOUR_OF_DAY = 11;
    public static final int MINUTE = 12;
    public static final int SECOND = 13;
    public static final int MILLISECOND = 14;
    public static final int ZONE_OFFSET = 15;
    public static final int DST_OFFSET = 16;

    public static final int SUNDAY = 1;
    public static final int MONDAY = 2;
    public static final int TUESDAY = 3;
    public static final int WEDNESDAY = 4;
    public static final int THURSDAY = 5;
    public static final int FRIDAY = 6;
    public static final int SATURDAY = 7;
    public static final int JANUARY = 0;
    public static final int FEBRUARY = 1;
    public static final int MARCH = 2;
    public static final int APRIL = 3;
    public static final int MAY = 4;
    public static final int JUNE = 5;
    public static final int JULY = 6;
    public static final int AUGUST = 7;
    public static final int SEPTEMBER = 8;
    public static final int OCTOBER = 9;
    public static final int NOVEMBER = 10;
    public static final int DECEMBER = 11;
    public static final int AM = 0;
    public static final int PM = 1;

    protected int[] fields = new int[17];
    protected boolean[] isSet = new boolean[17];
    protected long time;
    private TimeZone zone;

    protected Calendar() {
        zone = TimeZone.getDefault();
        setTimeInMillis(System.currentTimeMillis());
    }

    public static synchronized Calendar getInstance() {
        return new GregorianCalendar();
    }

    public static synchronized Calendar getInstance(TimeZone zone) {
        Calendar c = new GregorianCalendar();
        c.setTimeZone(zone);
        return c;
    }

    public final Date getTime() {
        return new Date(time);
    }

    public final void setTime(Date date) {
        setTimeInMillis(date.getTime());
    }

    protected long getTimeInMillis() {
        return time;
    }

    protected void setTimeInMillis(long millis) {
        time = millis;
        computeFields();
    }

    public final int get(int field) {
        return fields[field];
    }

    public final void set(int field, int value) {
        fields[field] = value;
        isSet[field] = true;
        computeTime();
        computeFields();
    }

    public void setTimeZone(TimeZone value) {
        zone = value;
        computeFields();
    }

    public TimeZone getTimeZone() {
        return zone;
    }

    public boolean equals(Object obj) {
        return obj instanceof Calendar && ((Calendar) obj).time == time;
    }

    public int hashCode() {
        return (int) time ^ (int) (time >> 32);
    }

    public boolean before(Object when) {
        return when instanceof Calendar && time < ((Calendar) when).time;
    }

    public boolean after(Object when) {
        return when instanceof Calendar && time > ((Calendar) when).time;
    }

    protected abstract void computeFields();

    protected abstract void computeTime();
}

class GregorianCalendar extends Calendar {
    private static long floorDiv(long a, long b) {
        long q = a / b;
        return (a % b != 0 && ((a ^ b) < 0)) ? q - 1 : q;
    }

    /** days since 1970-01-01 for a proleptic Gregorian date (month 1..12) */
    private static long daysFromCivil(long y, int m, int d) {
        y -= m <= 2 ? 1 : 0;
        long era = floorDiv(y, 400);
        long yoe = y - era * 400;
        long doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
        long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        return era * 146097 + doe - 719468;
    }

    protected void computeFields() {
        long local = time + getTimeZone().getRawOffset();
        long days = floorDiv(local, 86400000L);
        int msOfDay = (int) (local - days * 86400000L);
        long z = days + 719468;
        long era = floorDiv(z, 146097);
        long doe = z - era * 146097;
        long yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        long y = yoe + era * 400;
        long doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        long mp = (5 * doy + 2) / 153;
        int d = (int) (doy - (153 * mp + 2) / 5 + 1);
        int m = (int) (mp < 10 ? mp + 3 : mp - 9);
        if (m <= 2) {
            y++;
        }
        int year = (int) y;
        fields[ERA] = 1;
        fields[YEAR] = year;
        fields[MONTH] = m - 1;
        fields[DAY_OF_MONTH] = d;
        fields[DAY_OF_YEAR] = (int) (days - daysFromCivil(year, 1, 1)) + 1;
        fields[DAY_OF_WEEK] = (int) (floorDiv(days + 4, 7) * -7 + days + 4) + 1;
        fields[DAY_OF_WEEK_IN_MONTH] = (d - 1) / 7 + 1;
        fields[WEEK_OF_YEAR] = (fields[DAY_OF_YEAR] - 1) / 7 + 1;
        fields[WEEK_OF_MONTH] = (d - 1) / 7 + 1;
        fields[HOUR_OF_DAY] = msOfDay / 3600000;
        fields[AM_PM] = fields[HOUR_OF_DAY] >= 12 ? PM : AM;
        fields[HOUR] = fields[HOUR_OF_DAY] % 12;
        fields[MINUTE] = (msOfDay / 60000) % 60;
        fields[SECOND] = (msOfDay / 1000) % 60;
        fields[MILLISECOND] = msOfDay % 1000;
        fields[ZONE_OFFSET] = getTimeZone().getRawOffset();
        fields[DST_OFFSET] = 0;
    }

    protected void computeTime() {
        int year = fields[YEAR];
        int month = fields[MONTH];
        year += month >= 0 ? month / 12 : (month - 11) / 12;
        month = ((month % 12) + 12) % 12;
        int hour = isSet[HOUR] && !isSet[HOUR_OF_DAY] ? fields[HOUR] + (fields[AM_PM] == PM ? 12 : 0)
                : fields[HOUR_OF_DAY];
        isSet[HOUR] = false;
        isSet[HOUR_OF_DAY] = false;
        long days = daysFromCivil(year, month + 1, 1) + fields[DAY_OF_MONTH] - 1;
        long ms = (((days * 24 + hour) * 60 + fields[MINUTE]) * 60 + fields[SECOND]) * 1000 + fields[MILLISECOND];
        time = ms - getTimeZone().getRawOffset();
    }
}
