package org.example;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Executors;

/** Serves the browser game from {@code resources/web} and the highscore REST API. */
public class TetrisServer {

    private static final Map<String, String> CONTENT_TYPES = Map.of(
            "html", "text/html; charset=utf-8",
            "css", "text/css; charset=utf-8",
            "js", "text/javascript; charset=utf-8",
            "json", "application/json; charset=utf-8",
            "svg", "image/svg+xml",
            "png", "image/png",
            "ico", "image/x-icon");

    private final HttpServer server;
    private final HighscoreStore store;

    public TetrisServer(int port, HighscoreStore store) throws IOException {
        this.store = store;
        this.server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/api/scores", this::handleScores);
        server.createContext("/", this::handleStatic);
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
    }

    public void start() {
        server.start();
    }

    public void stop() {
        server.stop(0);
    }

    public int port() {
        return server.getAddress().getPort();
    }

    private void handleStatic(HttpExchange ex) throws IOException {
        try (ex) {
            if (!ex.getRequestMethod().equals("GET") && !ex.getRequestMethod().equals("HEAD")) {
                send(ex, 405, "text/plain", "Method not allowed");
                return;
            }
            String path = ex.getRequestURI().getPath();
            if (path.equals("/")) {
                path = "/index.html";
            }
            if (path.contains("..")) {
                send(ex, 400, "text/plain", "Bad path");
                return;
            }
            try (InputStream in = getClass().getResourceAsStream("/web" + path)) {
                if (in == null) {
                    send(ex, 404, "text/plain", "Not found");
                    return;
                }
                byte[] body = in.readAllBytes();
                String ext = path.substring(path.lastIndexOf('.') + 1);
                ex.getResponseHeaders().set("Content-Type", CONTENT_TYPES.getOrDefault(ext, "application/octet-stream"));
                ex.getResponseHeaders().set("Cache-Control", "no-cache");
                ex.sendResponseHeaders(200, body.length);
                ex.getResponseBody().write(body);
            }
        }
    }

    private void handleScores(HttpExchange ex) throws IOException {
        try (ex) {
            switch (ex.getRequestMethod()) {
                case "GET" -> {
                    String mode = parseForm(ex.getRequestURI().getRawQuery()).getOrDefault("mode", "marathon");
                    if (!HighscoreStore.MODES.contains(mode)) {
                        send(ex, 400, "application/json", "{\"error\":\"unknown mode\"}");
                        return;
                    }
                    send(ex, 200, "application/json", Json.array(store.top(mode)));
                }
                case "POST" -> {
                    String raw = new String(ex.getRequestBody().readNBytes(4096), StandardCharsets.UTF_8);
                    Score score;
                    try {
                        score = toScore(parseForm(raw));
                    } catch (IllegalArgumentException e) {
                        send(ex, 400, "application/json", "{\"error\":\"" + Json.escape(e.getMessage()) + "\"}");
                        return;
                    }
                    int rank = store.add(score);
                    send(ex, 200, "application/json",
                            "{\"rank\":" + rank + ",\"scores\":" + Json.array(store.top(score.mode())) + "}");
                }
                default -> send(ex, 405, "text/plain", "Method not allowed");
            }
        }
    }

    static Score toScore(Map<String, String> form) {
        String mode = form.getOrDefault("mode", "");
        if (!HighscoreStore.MODES.contains(mode)) {
            throw new IllegalArgumentException("unknown mode");
        }
        String name = sanitizeName(form.getOrDefault("name", ""));
        long score = parseNonNegative(form.get("score"), "score");
        int lines = (int) parseNonNegative(form.get("lines"), "lines");
        int level = (int) parseNonNegative(form.get("level"), "level");
        long timeMs = parseNonNegative(form.get("timeMs"), "timeMs");
        return new Score(name, mode, score, lines, level, timeMs, System.currentTimeMillis());
    }

    static String sanitizeName(String name) {
        String clean = name.replaceAll("[^\\p{L}\\p{N} _.-]", "").strip();
        if (clean.length() > 12) {
            clean = clean.substring(0, 12);
        }
        return clean.isEmpty() ? "PLAYER" : clean;
    }

    private static long parseNonNegative(String value, String field) {
        try {
            long v = Long.parseLong(value);
            if (v < 0) {
                throw new IllegalArgumentException(field + " must be >= 0");
            }
            return v;
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("invalid " + field);
        }
    }

    static Map<String, String> parseForm(String raw) {
        Map<String, String> result = new HashMap<>();
        if (raw == null || raw.isEmpty()) {
            return result;
        }
        for (String pair : raw.split("&")) {
            int eq = pair.indexOf('=');
            if (eq <= 0) {
                continue;
            }
            result.put(URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8),
                    URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8));
        }
        return result;
    }

    private static void send(HttpExchange ex, int status, String type, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", type.contains("charset") ? type : type + "; charset=utf-8");
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = ex.getResponseBody()) {
            out.write(bytes);
        }
    }
}
