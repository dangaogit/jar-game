import com.samsung.util.SM;
import com.samsung.util.SMS;
import javax.microedition.io.Connector;
import javax.wireless.messaging.BinaryMessage;
import javax.wireless.messaging.MessageConnection;
import javax.wireless.messaging.TextMessage;

// Typical premium-SMS purchase code; prints whether each payment "went through".
public class Main {
    public static void main(String[] args) {
        try {
            MessageConnection conn = (MessageConnection) Connector.open("sms://10658008:16000");
            TextMessage msg = (TextMessage) conn.newMessage(MessageConnection.TEXT_MESSAGE);
            msg.setPayloadText("BUY LEVEL2");
            conn.send(msg);
            conn.close();
            System.out.println("wma text: paid");
        } catch (Exception e) {
            System.out.println("wma text: " + e.getClass().getName() + " " + e.getMessage());
        }
        try {
            MessageConnection conn = (MessageConnection) Connector.open("sms://:5000");
            BinaryMessage msg = (BinaryMessage) conn.newMessage(MessageConnection.BINARY_MESSAGE, "sms://10669588");
            msg.setPayloadData(new byte[] {1, 2, (byte) 0xab});
            conn.send(msg);
            System.out.println("wma binary: paid");
        } catch (Exception e) {
            System.out.println("wma binary: " + e.getClass().getName() + " " + e.getMessage());
        }
        try {
            SMS.send(new SM("1066916500", null, "GOLD"));
            System.out.println("samsung: paid");
        } catch (Exception e) {
            System.out.println("samsung: " + e.getClass().getName() + " " + e.getMessage());
        }
        System.out.println("smsc " + System.getProperty("wireless.messaging.sms.smsc"));
    }
}
