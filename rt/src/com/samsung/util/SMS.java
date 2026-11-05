package com.samsung.util;

import java.io.IOException;

/** Messaging is not available in the emulator; sending fails like a phone without network. */
public final class SMS {
    private SMS() {
    }

    public static boolean isSupported() {
        return false;
    }

    public static void send(SM message) throws IOException {
        throw new IOException("SMS not available");
    }
}
