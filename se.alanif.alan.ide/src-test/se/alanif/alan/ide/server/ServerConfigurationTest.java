package se.alanif.alan.ide.server;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.List;


import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.DisabledOnOs;
import org.junit.jupiter.api.condition.OS;
import org.junit.jupiter.api.io.TempDir;

/**
 * That a launched server actually finds the compiler it was told about.
 *
 * <p>Every part of this had unit tests and the assembled whole was still broken:
 * 0.7.1 and 0.7.2 shipped with compiler diagnostics that never ran, because #11
 * moved the compiler's location onto a channel the server does not read. Nothing
 * failed -- the server fell back to bare {@code alan}, which is on PATH on every
 * machine we develop on, so the wrong answer and the right one looked identical
 * here and only diverged on the Windows installs we do not run tests on.
 *
 * <p>So this test starts a real server as a real process, with a compiler that is
 * NOT on PATH, and reads the diagnostics off the wire. It is the only assertion in
 * the suite that can tell configuration-was-delivered from configuration-was-
 * guessed, and it can only do that by refusing to let the fallback succeed.
 *
 * <p>The compiler is a stub. What is under test is the plumbing -- whether the
 * server invokes what it was given -- and a stub answers that where the real
 * compiler, absent from CI, cannot.
 */
@DisplayName("A launched language server")
class ServerConfigurationTest {

	private static final String STUB_MESSAGE = "Stub compiler was here.";

	@Test
	@DisplayName("reports diagnostics from the compiler named in its environment")
	@DisabledOnOs(value = OS.WINDOWS, disabledReason = "the stub compiler is a shell script")
	void usesTheConfiguredCompiler(@TempDir Path project) throws Exception {
		Path source = project.resolve("game.alan");
		Files.writeString(source, String.join("\n",
				"The kitchen IsA location.",
				"End the.",
				"",
				"Start at kitchen."));

		String published = diagnosticsFor(source, stubCompilerIn(project));

		assertTrue(published.contains(STUB_MESSAGE),
				"the server did not run the compiler it was given; it published: " + published);
	}

	/**
	 * A compiler that always reports one error, at the top of whatever file it was
	 * handed last. The real compiler is passed a temp copy of the buffer and names
	 * that copy in its output, so the stub echoes back its own last argument.
	 */
	private Path stubCompilerIn(Path dir) throws IOException {
		Path stub = dir.resolve("stub-alan");
		Files.writeString(stub, String.join("\n",
				"#!/bin/sh",
				"for a; do last=$a; done",
				"base=${last##*/}",
				"echo \"\\\"$base\\\", line 1 0-3: 999 E : " + STUB_MESSAGE + "\"",
				""));
		Files.setPosixFilePermissions(stub, PosixFilePermissions.fromString("rwxr-xr-x"));
		return stub;
	}

	/**
	 * Start a server, open the file, and return the text of the first non-empty
	 * publishDiagnostics for it. Speaking LSP by hand rather than through a client
	 * library is the point: the client library is what we are checking.
	 */
	private String diagnosticsFor(Path source, Path compiler) throws Exception {
		ProcessBuilder pb = new ProcessBuilder(
				Path.of(System.getProperty("java.home"), "bin", "java").toString(),
				"-cp", System.getProperty("java.class.path"),
				"org.eclipse.xtext.ide.server.ServerLauncher");
		// PATH is emptied so a developer's own `alan` cannot rescue a server that
		// ignored its configuration -- which is exactly how the bug stayed hidden.
		pb.environment().put("PATH", "");
		pb.environment().put("ALAN_COMPILER", compiler.toString());
		pb.redirectError(ProcessBuilder.Redirect.DISCARD);
		Process server = pb.start();
		try {
			OutputStream out = server.getOutputStream();
			InputStream in = new BufferedInputStream(server.getInputStream());
			String uri = source.toUri().toString();
			String root = source.getParent().toUri().toString();

			send(out, "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{"
					+ "\"processId\":null,\"rootUri\":\"" + root + "\",\"capabilities\":{}}}");
			readUntil(in, "\"id\":1");
			send(out, "{\"jsonrpc\":\"2.0\",\"method\":\"initialized\",\"params\":{}}");
			send(out, "{\"jsonrpc\":\"2.0\",\"method\":\"textDocument/didOpen\",\"params\":{"
					+ "\"textDocument\":{\"uri\":\"" + uri + "\",\"languageId\":\"alan\","
					+ "\"version\":1,\"text\":" + quote(Files.readString(source)) + "}}}");

			return readUntil(in, "publishDiagnostics", "\"diagnostics\":[{");
		} finally {
			server.destroyForcibly();
			server.waitFor();
		}
	}

	/** Read framed messages until one contains every marker, or we run out of patience. */
	private String readUntil(InputStream in, String... markers) throws IOException {
		long deadline = System.currentTimeMillis() + 30_000;
		StringBuilder seen = new StringBuilder();
		while (true) {
			String message = readMessage(in, deadline);
			if (message == null) {
				break;
			}
			seen.append(message).append('\n');
			if (List.of(markers).stream().allMatch(message::contains)) {
				return message;
			}
		}
		fail("no message matching " + List.of(markers) + " arrived within the deadline. Saw:\n" + seen);
		return null;
	}

	/** One Content-Length framed LSP message, or null if the deadline passes first. */
	private String readMessage(InputStream in, long deadline) throws IOException {
		int length = -1;
		String header;
		while ((header = readLine(in, deadline)) != null && !header.isEmpty()) {
			if (header.toLowerCase().startsWith("content-length:")) {
				length = Integer.parseInt(header.substring(header.indexOf(':') + 1).trim());
			}
		}
		if (header == null || length < 0) {
			return null;
		}
		byte[] body = new byte[length];
		for (int i = 0; i < length; i++) {
			int c = read(in, deadline);
			if (c < 0) {
				return null;
			}
			body[i] = (byte) c;
		}
		return new String(body, StandardCharsets.UTF_8);
	}

	private String readLine(InputStream in, long deadline) throws IOException {
		StringBuilder line = new StringBuilder();
		int c;
		while ((c = read(in, deadline)) >= 0) {
			if (c == '\n') {
				return line.toString();
			}
			if (c != '\r') {
				line.append((char) c);
			}
		}
		return null;
	}

	/**
	 * One byte, or -1 once the deadline passes. A plain blocking read would be simpler
	 * and wrong: when the server has nothing more to say -- which is precisely what a
	 * regression here looks like -- it would wait forever, and the failure this test
	 * exists to catch would show up in CI as a hang rather than as a red test.
	 */
	private int read(InputStream in, long deadline) throws IOException {
		while (System.currentTimeMillis() < deadline) {
			if (in.available() > 0) {
				return in.read();
			}
			try {
				Thread.sleep(20);
			} catch (InterruptedException e) {
				Thread.currentThread().interrupt();
				return -1;
			}
		}
		return -1;
	}

	private void send(OutputStream out, String json) throws IOException {
		byte[] body = json.getBytes(StandardCharsets.UTF_8);
		out.write(("Content-Length: " + body.length + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
		out.write(body);
		out.flush();
	}

	private String quote(String text) {
		return "\"" + text.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\"";
	}
}
