package com.samsung.util;

import jargame.Host;
import java.io.IOException;

/** Sending goes to the host's billing hook, which decides whether the game sees success. */
public final class SMS {
    private SMS() {
    }

    public static boolean isSupported() {
        return true;
    }

    public static void send(SM message) throws IOException {
        if (message == null) {
            throw new NullPointerException();
        }
        String dest = message.getDestAddress();
        if (dest == null) {
            throw new IllegalArgumentException("no destination address");
        }
        String data = message.getData();
        if (!Host.billing(Host.BILLING_SAMSUNG_SMS, dest, data != null ? data : "")) {
            throw new IOException("SMS send failed");
        }
    }
}
