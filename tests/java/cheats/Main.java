// Game-like state for tests/cheats.test.ts; on its own it waits a little and prints the untouched values.
public class Main {
    static Main inst;
    static int money = 1234;

    Player player = new Player();
    int[] items = {7, 8, 9};

    public static void main(String[] args) throws Exception {
        inst = new Main();
        for (int i = 0; i < 20 && inst.player.hp != 999; i++) {
            inst.player.steps++;
            Thread.sleep(10);
        }
        System.out.println("hp=" + inst.player.hp + " money=" + money + " item1=" + inst.items[1]);
    }
}

class Player {
    int hp = 100;
    int steps;
}
