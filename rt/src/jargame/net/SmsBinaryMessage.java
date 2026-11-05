package jargame.net;

import javax.wireless.messaging.BinaryMessage;

final class SmsBinaryMessage extends SmsMessage implements BinaryMessage {
    private byte[] data;

    SmsBinaryMessage(String address) {
        super(address);
    }

    public byte[] getPayloadData() {
        return data;
    }

    public void setPayloadData(byte[] data) {
        this.data = data;
    }
}
