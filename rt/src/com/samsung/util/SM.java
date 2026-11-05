package com.samsung.util;

public class SM {
    private String destAddress;
    private String callbackAddress;
    private String data;

    public SM() {
    }

    public SM(String dest, String callback, String textMessage) {
        destAddress = dest;
        callbackAddress = callback;
        data = textMessage;
    }

    public String getDestAddress() {
        return destAddress;
    }

    public void setDestAddress(String address) {
        destAddress = address;
    }

    public String getCallbackAddress() {
        return callbackAddress;
    }

    public void setCallbackAddress(String address) {
        callbackAddress = address;
    }

    public String getData() {
        return data;
    }

    public void setData(String textMessage) {
        data = textMessage;
    }
}
