package org.example;

import java.awt.Desktop;
import java.net.URI;
import java.nio.file.Path;

/**
 * Starts the Tetris web server. Usage: {@code ./gradlew run} (optional: {@code --args="9090"} for another port).
 */
public class Main {

    public static void main(String[] args) throws Exception {
        int port = args.length > 0 ? Integer.parseInt(args[0])
                : Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));

        HighscoreStore store = new HighscoreStore(Path.of("highscores.tsv"));
        TetrisServer server = new TetrisServer(port, store);
        server.start();

        String url = "http://localhost:" + server.port() + "/";
        System.out.println("Tetris läuft auf " + url + "  (Strg+C zum Beenden)");
        openBrowser(url);
    }

    private static void openBrowser(String url) {
        try {
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(URI.create(url));
            }
        } catch (Exception | Error ignored) {
            // headless or no browser available: the URL is printed anyway
        }
    }
}
