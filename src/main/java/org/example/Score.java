package org.example;

/** A single highscore entry. {@code timeMs} is the play time (the ranking key in sprint mode). */
public record Score(String name, String mode, long score, int lines, int level, long timeMs, long date) {

    String toTsv() {
        return String.join("\t", mode, name, Long.toString(score), Integer.toString(lines),
                Integer.toString(level), Long.toString(timeMs), Long.toString(date));
    }

    static Score fromTsv(String line) {
        String[] p = line.split("\t");
        if (p.length != 7) {
            throw new IllegalArgumentException("Invalid highscore line: " + line);
        }
        return new Score(p[1], p[0], Long.parseLong(p[2]), Integer.parseInt(p[3]),
                Integer.parseInt(p[4]), Long.parseLong(p[5]), Long.parseLong(p[6]));
    }

    String toJson() {
        return "{\"name\":\"" + Json.escape(name) + "\",\"mode\":\"" + mode + "\",\"score\":" + score
                + ",\"lines\":" + lines + ",\"level\":" + level + ",\"timeMs\":" + timeMs + ",\"date\":" + date + "}";
    }
}
