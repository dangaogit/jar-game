package javax.microedition.media.protocol;

import java.io.IOException;
import javax.microedition.media.Controllable;

public interface SourceStream extends Controllable {
    int NOT_SEEKABLE = 0;
    int SEEKABLE_TO_START = 1;
    int RANDOM_ACCESSIBLE = 2;

    ContentDescriptor getContentDescriptor();

    long getContentLength();

    int read(byte[] b, int off, int len) throws IOException;

    int getTransferSize();

    long seek(long where) throws IOException;

    long tell();

    int getSeekType();
}
