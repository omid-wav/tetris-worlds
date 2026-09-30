package org.example;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class HighscoreStoreTest {

    @TempDir
    Path dir;

    private static Score score(String mode, long points, long timeMs) {
        return new Score("P" + points, mode, points, 10, 2, timeMs, System.nanoTime());
    }

    @Test
    void marathonRanksByScoreDescending() {
        HighscoreStore store = new HighscoreStore(dir.resolve("hs.tsv"));
        assertEquals(1, store.add(score("marathon", 100, 0)));
        assertEquals(1, store.add(score("marathon", 500, 0)));
        assertEquals(3, store.add(score("marathon", 50, 0)));
        assertEquals(500, store.top("marathon").getFirst().score());
    }

    @Test
    void sprintRanksByTimeAscending() {
        HighscoreStore store = new HighscoreStore(dir.resolve("hs.tsv"));
        store.add(score("sprint", 0, 60_000));
        assertEquals(1, store.add(score("sprint", 0, 45_000)));
        assertEquals(45_000, store.top("sprint").getFirst().timeMs());
    }

    @Test
    void keepsOnlyTopTenAndReportsMisses() {
        HighscoreStore store = new HighscoreStore(dir.resolve("hs.tsv"));
        for (int i = 1; i <= HighscoreStore.MAX_ENTRIES; i++) {
            store.add(score("ultra", i * 100, 0));
        }
        assertEquals(-1, store.add(score("ultra", 1, 0)));
        assertEquals(HighscoreStore.MAX_ENTRIES, store.top("ultra").size());
    }

    @Test
    void persistsAcrossInstances() {
        Path file = dir.resolve("hs.tsv");
        new HighscoreStore(file).add(new Score("Omid", "marathon", 4242, 42, 5, 1234, 1));
        Score loaded = new HighscoreStore(file).top("marathon").getFirst();
        assertEquals("Omid", loaded.name());
        assertEquals(4242, loaded.score());
    }

    @Test
    void formParsingValidatesInput() {
        Score s = TetrisServer.toScore(TetrisServer.parseForm("name=%3Cb%3EAl+ice&mode=ultra&score=10&lines=1&level=1&timeMs=5"));
        assertEquals("bAl ice", s.name());
        assertThrows(IllegalArgumentException.class,
                () -> TetrisServer.toScore(Map.of("mode", "zen", "score", "1", "lines", "1", "level", "1", "timeMs", "1")));
        assertThrows(IllegalArgumentException.class,
                () -> TetrisServer.toScore(Map.of("mode", "ultra", "score", "-1", "lines", "1", "level", "1", "timeMs", "1")));
    }
}
