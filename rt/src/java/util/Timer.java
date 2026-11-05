package java.util;

public class Timer {
    private final Vector queue = new Vector();
    private boolean cancelled;
    private final Thread thread;

    public Timer() {
        thread = new Thread(new TimerLoop(this), "Timer");
        thread.start();
    }

    private void add(TimerTask task, long delay, long period, boolean fixedRate) {
        if (delay < 0) {
            throw new IllegalArgumentException("Negative delay.");
        }
        if (task == null) {
            throw new NullPointerException();
        }
        synchronized (queue) {
            if (cancelled) {
                throw new IllegalStateException("Timer already cancelled.");
            }
            if (task.cancelled || task.nextTime != 0) {
                throw new IllegalStateException("Task already scheduled or cancelled");
            }
            task.nextTime = System.currentTimeMillis() + delay;
            task.period = period;
            task.fixedRate = fixedRate;
            queue.addElement(task);
            queue.notifyAll();
        }
    }

    public void schedule(TimerTask task, long delay) {
        add(task, delay, 0, false);
    }

    public void schedule(TimerTask task, Date time) {
        add(task, Math.max(0, time.getTime() - System.currentTimeMillis()), 0, false);
    }

    public void schedule(TimerTask task, long delay, long period) {
        if (period <= 0) {
            throw new IllegalArgumentException("Non-positive period.");
        }
        add(task, delay, period, false);
    }

    public void scheduleAtFixedRate(TimerTask task, long delay, long period) {
        if (period <= 0) {
            throw new IllegalArgumentException("Non-positive period.");
        }
        add(task, delay, period, true);
    }

    public void cancel() {
        synchronized (queue) {
            cancelled = true;
            queue.removeAllElements();
            queue.notifyAll();
        }
    }

    static final class TimerLoop implements Runnable {
        private final Timer timer;

        TimerLoop(Timer timer) {
            this.timer = timer;
        }

        public void run() {
            Vector queue = timer.queue;
            while (true) {
                TimerTask due = null;
                synchronized (queue) {
                    if (timer.cancelled) {
                        return;
                    }
                    long now = System.currentTimeMillis();
                    long nextWake = Long.MAX_VALUE;
                    for (int i = 0; i < queue.size(); i++) {
                        TimerTask t = (TimerTask) queue.elementAt(i);
                        if (t.cancelled) {
                            queue.removeElementAt(i--);
                            continue;
                        }
                        if (t.nextTime <= now) {
                            due = t;
                            if (t.period > 0) {
                                t.nextTime = t.fixedRate ? t.nextTime + t.period : now + t.period;
                            } else {
                                queue.removeElementAt(i);
                            }
                            break;
                        }
                        nextWake = Math.min(nextWake, t.nextTime);
                    }
                    if (due == null) {
                        try {
                            queue.wait(nextWake == Long.MAX_VALUE ? 0 : Math.max(1, nextWake - now));
                        } catch (InterruptedException e) {
                            return;
                        }
                        continue;
                    }
                }
                try {
                    due.run();
                } catch (Throwable t) {
                    t.printStackTrace();
                }
            }
        }
    }
}
