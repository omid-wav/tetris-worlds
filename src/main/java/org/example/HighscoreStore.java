package org.example;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Thread-safe highscore table per game mode, persisted as a TSV file. */
public class HighscoreStore {

    public static final Set<String> MODES = Set.of("marathon", "sprint", "ultra");
    public static final int MAX_ENTRIES = 10;

    private final Path file;
    private final Map<String, List<Score>> tables = new HashMap<>();

    public HighscoreStore(Path file) {
        this.file = file;
        MODES.forEach(m -> tables.put(m, new ArrayList<>()));
        load();
    }

    /** Sprint is a race against the clock (lower time wins), all other modes rank by score. */
    static Comparator<Score> ranking(String mode) {
        Comparator<Score> byDate = Comparator.comparingLong(Score::date);
        if (mode.equals("sprint")) {
            return Comparator.comparingLong(Score::timeMs).thenComparing(byDate);
        }
        return Comparator.comparingLong(Score::score).reversed().thenComparing(byDate);
    }

    public synchronized List<Score> top(String mode) {
        return List.copyOf(tables.getOrDefault(mode, List.of()));
    }

    /** Adds the score and returns its 1-based rank, or -1 if it did not make it into the table. */
    public synchronized int add(Score score) {
        if (!MODES.contains(score.mode())) {
            throw new IllegalArgumentException("Unknown mode: " + score.mode());
        }
        List<Score> table = tables.get(score.mode());
        table.add(score);
        table.sort(ranking(score.mode()));
        while (table.size() > MAX_ENTRIES) {
            table.removeLast();
        }
        int rank = table.indexOf(score);
        if (rank >= 0) {
            save();
        }
        return rank < 0 ? -1 : rank + 1;
    }

    private void load() {
        if (!Files.exists(file)) {
            return;
        }
        try {
            for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
                if (line.isBlank()) {
                    continue;
                }
                try {
                    Score s = Score.fromTsv(line);
                    if (MODES.contains(s.mode())) {
                        tables.get(s.mode()).add(s);
                    }
                } catch (IllegalArgumentException e) {
                    System.err.println("Skipping corrupt highscore line: " + line);
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        tables.forEach((mode, table) -> {
            table.sort(ranking(mode));
            while (table.size() > MAX_ENTRIES) {
                table.removeLast();
            }
        });
    }

    private void save() {
        List<String> lines = new ArrayList<>();
        tables.values().forEach(t -> t.forEach(s -> lines.add(s.toTsv())));
        try {
            Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
            Files.write(tmp, lines, StandardCharsets.UTF_8);
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
