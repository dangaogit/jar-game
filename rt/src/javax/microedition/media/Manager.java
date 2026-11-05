package javax.microedition.media;

import jargame.media.BasicPlayer;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

public final class Manager {
    public static final String TONE_DEVICE_LOCATOR = "device://tone";
    public static final String MIDI_DEVICE_LOCATOR = "device://midi";

    private Manager() {
    }

    public static String[] getSupportedContentTypes(String protocol) {
        return new String[] {"audio/midi", "audio/x-wav", "audio/mpeg", "audio/amr", "audio/x-tone-seq"};
    }

    public static String[] getSupportedProtocols(String contentType) {
        return new String[] {"device", "resource"};
    }

    public static Player createPlayer(String locator) throws IOException, MediaException {
        if (locator == null) {
            throw new IllegalArgumentException();
        }
        return new BasicPlayer(null, locator);
    }

    public static Player createPlayer(InputStream stream, String type) throws IOException, MediaException {
        if (stream == null) {
            throw new IllegalArgumentException();
        }
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[1024];
        int n;
        while ((n = stream.read(buf, 0, buf.length)) > 0) {
            bos.write(buf, 0, n);
        }
        return new BasicPlayer(bos.toByteArray(), type);
    }

    public static Player createPlayer(javax.microedition.media.protocol.DataSource source)
            throws IOException, MediaException {
        if (source == null) {
            throw new IllegalArgumentException();
        }
        return new BasicPlayer(null, source.getContentType());
    }

    public static void playTone(int note, int duration, int volume) throws MediaException {
    }
}
