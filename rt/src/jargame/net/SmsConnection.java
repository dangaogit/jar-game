package jargame.net;

import jargame.Host;
import java.io.IOException;
import java.io.InterruptedIOException;
import javax.wireless.messaging.BinaryMessage;
import javax.wireless.messaging.Message;
import javax.wireless.messaging.MessageConnection;
import javax.wireless.messaging.MessageListener;
import javax.wireless.messaging.TextMessage;

/** sms:// connection: outgoing messages go to the host's billing hook, nothing is ever received. */
public final class SmsConnection implements MessageConnection {
    private final String address;
    private boolean closed;

    public SmsConnection(String url) {
        // client mode "sms://+8610658008:1234" carries a destination, server mode "sms://:1234" does not
        String rest = url.substring("sms://".length());
        this.address = rest.length() == 0 || rest.charAt(0) == ':' ? null : url;
    }

    public Message newMessage(String type) {
        return newMessage(type, address);
    }

    public Message newMessage(String type, String addr) {
        if (TEXT_MESSAGE.equals(type)) {
            return new SmsTextMessage(addr);
        }
        if (BINARY_MESSAGE.equals(type)) {
            return new SmsBinaryMessage(addr);
        }
        throw new IllegalArgumentException("message type not supported: " + type);
    }

    public void send(Message msg) throws IOException, InterruptedIOException {
        if (closed) {
            throw new IOException("connection closed");
        }
        if (msg == null) {
            throw new NullPointerException();
        }
        String to = msg.getAddress();
        if (to == null) {
            throw new IllegalArgumentException("no destination address");
        }
        if (!Host.billing(Host.BILLING_SMS, stripScheme(to), payload(msg))) {
            throw new IOException("SMS send failed");
        }
    }

    public synchronized Message receive() throws IOException, InterruptedIOException {
        while (!closed) {
            try {
                wait();
            } catch (InterruptedException e) {
                throw new InterruptedIOException();
            }
        }
        throw new IOException("connection closed");
    }

    public int numberOfSegments(Message msg) {
        return 1;
    }

    public void setMessageListener(MessageListener l) throws IOException {
        if (closed) {
            throw new IOException("connection closed");
        }
    }

    public synchronized void close() {
        closed = true;
        notifyAll();
    }

    private static String stripScheme(String addr) {
        return addr.startsWith("sms://") ? addr.substring("sms://".length()) : addr;
    }

    private static String payload(Message msg) {
        if (msg instanceof TextMessage) {
            String s = ((TextMessage) msg).getPayloadText();
            return s != null ? s : "";
        }
        byte[] data = ((BinaryMessage) msg).getPayloadData();
        if (data == null) {
            return "";
        }
        String hex = "0123456789abcdef";
        StringBuffer sb = new StringBuffer();
        for (int i = 0; i < data.length; i++) {
            int b = data[i] & 0xff;
            sb.append(hex.charAt(b >> 4)).append(hex.charAt(b & 15));
        }
        return sb.toString();
    }
}
