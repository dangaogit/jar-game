package javax.microedition.lcdui;

import jargame.Host;
import java.util.Vector;

public class Form extends Screen {
    private final Vector items = new Vector();
    private ItemStateListener itemStateListener;

    public Form(String title) {
        this.title = title;
    }

    public Form(String title, Item[] items) {
        this(title);
        if (items != null) {
            for (int i = 0; i < items.length; i++) {
                append(items[i]);
            }
        }
    }

    public int append(Item item) {
        if (item.owner != null) {
            throw new IllegalStateException();
        }
        item.owner = this;
        items.addElement(item);
        $changed();
        return items.size() - 1;
    }

    public int append(String str) {
        return append(new StringItem(null, str));
    }

    public int append(Image img) {
        return append(new ImageItem(null, img, ImageItem.LAYOUT_DEFAULT, null));
    }

    public void insert(int itemNum, Item item) {
        item.owner = this;
        items.insertElementAt(item, itemNum);
        $changed();
    }

    public void delete(int itemNum) {
        Item item = (Item) items.elementAt(itemNum);
        item.owner = null;
        items.removeElementAt(itemNum);
        $changed();
    }

    public void deleteAll() {
        for (int i = 0; i < items.size(); i++) {
            ((Item) items.elementAt(i)).owner = null;
        }
        items.removeAllElements();
        $changed();
    }

    public void set(int itemNum, Item item) {
        ((Item) items.elementAt(itemNum)).owner = null;
        item.owner = this;
        items.setElementAt(item, itemNum);
        $changed();
    }

    public Item get(int itemNum) {
        return (Item) items.elementAt(itemNum);
    }

    public void setItemStateListener(ItemStateListener iListener) {
        itemStateListener = iListener;
    }

    public int size() {
        return items.size();
    }

    void $showOnHost() {
        int n = items.size();
        String[] texts = new String[n * 2];
        int[] kinds = new int[n];
        for (int i = 0; i < n; i++) {
            Item it = (Item) items.elementAt(i);
            texts[i * 2] = it.label == null ? "" : it.label;
            texts[i * 2 + 1] = it.$text();
            kinds[i] = it.$kind();
        }
        Host.showScreen(Host.SCREEN_FORM, title, texts, kinds, $commandLabels(), -1);
    }

    void $applyTexts(String[] texts) {
        for (int i = 0; i < items.size() && i < texts.length; i++) {
            Item it = (Item) items.elementAt(i);
            int kind = it.$kind();
            if ((kind == Item.KIND_INPUT || kind == Item.KIND_CHOICE) && texts[i] != null
                    && !texts[i].equals(it.$text())) {
                it.$setText(texts[i]);
                if (itemStateListener != null) {
                    itemStateListener.itemStateChanged(it);
                }
            }
        }
    }
}
