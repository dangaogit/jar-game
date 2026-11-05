package jargame.net;

import javax.wireless.messaging.TextMessage;

final class SmsTextMessage extends SmsMessage implements TextMessage {
    private String text;

    SmsTextMessage(String address) {
        super(address);
    }

    public String getPayloadText() {
        return text;
    }

    public void setPayloadText(String data) {
        text = data;
    }
}
