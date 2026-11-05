import java.util.Enumeration;
import java.util.Hashtable;
import java.util.Random;
import java.util.Stack;
import java.util.Vector;

/** Exercises the bytecode interpreter and core library; output must match a real JVM. */
public class Main {
    static int counter;
    static final String CONST = "const";
    static long bigStatic = 0x123456789ABCDEFL;

    static {
        counter = 10;
        System.out.println("Main.<clinit>");
    }

    interface Shape {
        int area();
    }

    static abstract class Base implements Shape {
        protected String name;

        Base(String name) {
            this.name = name;
        }

        public String describe() {
            return name + ":" + area();
        }
    }

    static class Rect extends Base {
        int w, h;

        Rect(int w, int h) {
            super("rect");
            this.w = w;
            this.h = h;
        }

        public int area() {
            return w * h;
        }
    }

    static class Square extends Rect {
        Square(int s) {
            super(s, s);
            name = "square";
        }

        public String describe() {
            return "[" + super.describe() + "]";
        }
    }

    static class Lazy {
        static int value;

        static {
            System.out.println("Lazy.<clinit>");
            value = 42;
        }
    }

    static class MyException extends Exception {
        int code;

        MyException(String msg, int code) {
            super(msg);
            this.code = code;
        }
    }

    static int fib(int n) {
        return n < 2 ? n : fib(n - 1) + fib(n - 2);
    }

    static String sw(int v) {
        switch (v) {
            case 0:
                return "zero";
            case 1:
                return "one";
            case 2:
                return "two";
            case 3:
                return "three";
            default:
                return "many";
        }
    }

    static String sparse(int v) {
        switch (v) {
            case -1000:
                return "neg";
            case 7:
                return "seven";
            case 100000:
                return "big";
            default:
                return "other";
        }
    }

    static int finallyTest(int x) {
        int r = 0;
        try {
            if (x == 0) {
                throw new IllegalStateException("zero");
            }
            r = 10 / x;
            return r;
        } catch (IllegalStateException e) {
            r = -1;
            return r;
        } finally {
            System.out.println("finally x=" + x + " r=" + r);
        }
    }

    static void thrower(int depth) throws MyException {
        if (depth == 0) {
            throw new MyException("deep", 7);
        }
        thrower(depth - 1);
    }

    public static void main(String[] args) throws Exception {
        // ints
        int a = Integer.MAX_VALUE;
        System.out.println(a + 1);
        System.out.println(Integer.MIN_VALUE / -1);
        System.out.println(-7 / 2);
        System.out.println(-7 % 3);
        System.out.println(7 % -3);
        System.out.println(-8 >> 1);
        System.out.println(-8 >>> 28);
        System.out.println(1 << 33);
        System.out.println(0x12345678 * 0x9abcdef);
        System.out.println((byte) 200);
        System.out.println((short) 70000);
        System.out.println((char) 65 + "" + (char) 0x4e2d);
        System.out.println((int) 'Z');
        // longs
        long l = Long.MAX_VALUE;
        System.out.println(l + 1);
        System.out.println(bigStatic * 31 + 7);
        System.out.println(Long.MIN_VALUE / -1);
        System.out.println(-7L / 2);
        System.out.println(-7L % 3);
        System.out.println(-1L >>> 1);
        System.out.println(-1L >> 63);
        System.out.println(1L << 65);
        System.out.println((int) 0x1234567890L);
        System.out.println((long) -1 & 0xFFFFFFFFL);
        System.out.println(Long.toString(255L, 16));
        System.out.println(l > 0 ? "pos" : "neg");
        // floats & doubles
        float f = 1.1f;
        double d = 1.1;
        System.out.println(f);
        System.out.println(d);
        System.out.println(f * 3);
        System.out.println(d * 3);
        System.out.println(1.0f / 3);
        System.out.println(100.0);
        System.out.println(1e10);
        System.out.println(1.5e-5);
        System.out.println(0.001);
        System.out.println(12345678.0f);
        System.out.println((int) 3.99);
        System.out.println((int) -3.99);
        System.out.println((int) Double.NaN);
        System.out.println((int) 1e20);
        System.out.println((long) -1e30);
        System.out.println(0.0 / 0.0);
        System.out.println(-1.0 / 0.0);
        System.out.println(Math.sqrt(2.0));
        System.out.println(Float.floatToIntBits(1.5f));
        System.out.println(Double.doubleToLongBits(-2.25));
        System.out.println(Float.intBitsToFloat(0x40490fdb));
        System.out.println(Double.parseDouble("3.25e2"));
        System.out.println(5 / 2.0f);
        System.out.println((float) 0.1 + (float) 0.2);
        // strings
        String s = "Hello, 世界";
        System.out.println(s.length());
        System.out.println(s.charAt(7));
        System.out.println(s.substring(7));
        System.out.println(s.indexOf("world") + " " + s.indexOf('o') + " " + s.lastIndexOf('l'));
        System.out.println(s.toUpperCase() + s.toLowerCase());
        System.out.println("  trim me  ".trim() + "|");
        System.out.println("a,b,c".replace(',', ';'));
        System.out.println("abc".compareTo("abd") + " " + "b".compareTo("a") + " " + "ab".compareTo("abc"));
        System.out.println("hash " + "hello".hashCode() + " " + s.hashCode());
        System.out.println("x".equals("x") + " " + "x".equals(null) + " " + "AbC".equalsIgnoreCase("aBc"));
        System.out.println(s.startsWith("Hell") + " " + s.endsWith("界") + " " + s.startsWith("lo", 3));
        System.out.println(String.valueOf(new char[] {'o', 'k'}) + String.valueOf(true) + String.valueOf(3.5));
        byte[] bytes = s.getBytes("UTF-8");
        System.out.println(bytes.length + " " + new String(bytes, "UTF-8"));
        System.out.println(Integer.parseInt("-1234") + Integer.parseInt("ff", 16));
        System.out.println(Integer.toHexString(-1) + " " + Integer.toBinaryString(10) + " " + Integer.toString(-255, 16));
        try {
            Integer.parseInt("12x");
        } catch (NumberFormatException e) {
            System.out.println("NFE ok");
        }
        StringBuffer sb = new StringBuffer();
        for (int i = 0; i < 5; i++) {
            sb.append(i).append(',');
        }
        sb.setLength(sb.length() - 1);
        sb.insert(0, "[").append(']').reverse();
        System.out.println(sb.toString());
        System.out.println(new StringBuffer("abcdef").delete(1, 3).deleteCharAt(0));
        // arrays
        int[] arr = new int[10];
        for (int i = 0; i < arr.length; i++) {
            arr[i] = i * i;
        }
        System.arraycopy(arr, 0, arr, 2, 5);
        StringBuffer as = new StringBuffer();
        for (int i = 0; i < arr.length; i++) {
            as.append(arr[i]).append(' ');
        }
        System.out.println(as);
        int[][] grid = new int[3][4];
        grid[2][3] = 5;
        System.out.println(grid.length + " " + grid[0].length + " " + grid[2][3]);
        long[][][] cube = new long[2][3][];
        System.out.println(cube[1].length + " " + (cube[1][2] == null));
        Object[] objs = new String[2];
        try {
            objs[0] = new Integer(1);
        } catch (ArrayStoreException e) {
            System.out.println("ASE ok");
        }
        try {
            System.out.println(arr[10]);
        } catch (ArrayIndexOutOfBoundsException e) {
            System.out.println("AIOOBE ok");
        }
        char[] cs = "hello".toCharArray();
        cs[0] = 'j';
        System.out.println(new String(cs));
        int[] cl = (int[]) arr.clone();
        cl[0] = 99;
        System.out.println(arr[0] + " " + cl[0]);
        // objects
        Shape[] shapes = {new Rect(2, 3), new Square(4)};
        for (int i = 0; i < shapes.length; i++) {
            System.out.println(((Base) shapes[i]).describe());
        }
        System.out.println(shapes[1] instanceof Rect);
        System.out.println(shapes[0] instanceof Square);
        try {
            Square sq = (Square) shapes[0];
            System.out.println(sq);
        } catch (ClassCastException e) {
            System.out.println("CCE ok");
        }
        System.out.println(counter + " " + CONST);
        System.out.println("before lazy");
        System.out.println(Lazy.value);
        // switches & control flow
        for (int i = -1; i < 5; i++) {
            System.out.print(sw(i) + " ");
        }
        System.out.println();
        System.out.println(sparse(7) + sparse(-1000) + sparse(100000) + sparse(3));
        System.out.println(fib(20));
        System.out.println(finallyTest(2) + " " + finallyTest(0));
        try {
            thrower(5);
        } catch (MyException e) {
            System.out.println("caught " + e.getMessage() + " " + e.code);
        }
        try {
            Object o = null;
            o.toString();
        } catch (NullPointerException e) {
            System.out.println("NPE ok");
        }
        try {
            System.out.println(10 / (counter - 10));
        } catch (ArithmeticException e) {
            System.out.println("AE " + e.getMessage());
        }
        // collections
        Vector v = new Vector();
        for (int i = 0; i < 20; i++) {
            v.addElement(new Integer(i));
        }
        v.removeElementAt(3);
        v.insertElementAt("x", 0);
        System.out.println(v.size() + " " + v.elementAt(0) + " " + v.indexOf(new Integer(10)) + " " + v.contains("x"));
        Hashtable h = new Hashtable();
        for (int i = 0; i < 50; i++) {
            h.put("k" + i, new Integer(i * 2));
        }
        h.remove("k3");
        int sum = 0;
        for (Enumeration e = h.elements(); e.hasMoreElements();) {
            sum += ((Integer) e.nextElement()).intValue();
        }
        System.out.println(h.size() + " " + h.get("k10") + " " + h.containsKey("k3") + " " + sum);
        Stack st = new Stack();
        st.push("a");
        st.push("b");
        System.out.println(st.pop() + "" + st.peek() + st.empty());
        Random r = new Random(12345L);
        System.out.println(r.nextInt() + " " + r.nextInt(100) + " " + r.nextLong() + " " + r.nextInt(64));
        // threads
        final Object lock = new Object();
        final int[] shared = new int[1];
        Thread[] ts = new Thread[4];
        for (int i = 0; i < ts.length; i++) {
            ts[i] = new Thread(new Runnable() {
                public void run() {
                    for (int k = 0; k < 1000; k++) {
                        synchronized (lock) {
                            shared[0]++;
                        }
                    }
                }
            });
            ts[i].start();
        }
        for (int i = 0; i < ts.length; i++) {
            ts[i].join();
        }
        System.out.println("shared " + shared[0]);
        final Vector queue = new Vector();
        Thread producer = new Thread(new Runnable() {
            public void run() {
                for (int i = 0; i < 5; i++) {
                    synchronized (queue) {
                        queue.addElement(new Integer(i));
                        queue.notify();
                    }
                    try {
                        Thread.sleep(5);
                    } catch (InterruptedException e) {
                        return;
                    }
                }
            }
        });
        producer.start();
        int got = 0;
        int total = 0;
        while (got < 5) {
            synchronized (queue) {
                while (queue.isEmpty()) {
                    queue.wait();
                }
                total += ((Integer) queue.elementAt(0)).intValue();
                queue.removeElementAt(0);
                got++;
            }
        }
        System.out.println("consumed " + got + " total " + total);
        System.out.println(new Integer(5).equals(new Integer(5)) + " " + new Long(7L).hashCode());
        System.out.println("done");
    }
}
