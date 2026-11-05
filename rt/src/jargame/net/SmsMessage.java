package jargame.net;

import java.util.Date;
import javax.wireless.messaging.Message;

abstract class SmsMessage implements Message {
    private String address;

    SmsMessage(String address) {
        this.address = address;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String addr) {
        address = addr;
    }

    public Date getTimestamp() {
        return null;
    }
}
