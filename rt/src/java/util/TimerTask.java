package java.util;

public abstract class TimerTask implements Runnable {
    boolean cancelled;
    long nextTime;
    long period;
    boolean fixedRate;

    protected TimerTask() {
    }

    public abstract void run();

    public boolean cancel() {
        boolean wasScheduled = !cancelled && nextTime != 0;
        cancelled = true;
        return wasScheduled;
    }

    public long scheduledExecutionTime() {
        return nextTime - period;
    }
}
