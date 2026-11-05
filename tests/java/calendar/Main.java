import java.util.Calendar;
import java.util.Date;
import java.util.TimeZone;

public class Main {
    static void dump(Calendar c) {
        System.out.println(c.get(Calendar.YEAR) + "-" + (c.get(Calendar.MONTH) + 1) + "-" + c.get(Calendar.DATE) + " "
                + c.get(Calendar.HOUR_OF_DAY) + ":" + c.get(Calendar.MINUTE) + ":" + c.get(Calendar.SECOND) + "."
                + c.get(Calendar.MILLISECOND) + " dow=" + c.get(Calendar.DAY_OF_WEEK) + " doy="
                + c.get(Calendar.DAY_OF_YEAR) + " ampm=" + c.get(Calendar.AM_PM) + " h=" + c.get(Calendar.HOUR));
    }

    public static void main(String[] args) {
        TimeZone tz = TimeZone.getTimeZone("GMT+08:00");
        System.out.println(tz.getRawOffset());
        Calendar c = Calendar.getInstance(tz);
        long[] times = {0L, 951782400000L, 1793783041323L, -86400000L * 400, 4102444800000L};
        for (int i = 0; i < times.length; i++) {
            c.setTime(new Date(times[i]));
            dump(c);
        }
        c.setTime(new Date(1793783041323L));
        c.set(Calendar.MONTH, 13);
        dump(c);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.DATE, 1);
        System.out.println(c.getTime().getTime());
        Calendar utc = Calendar.getInstance(TimeZone.getTimeZone("GMT"));
        utc.setTime(new Date(1709164800000L));
        dump(utc);
    }
}
