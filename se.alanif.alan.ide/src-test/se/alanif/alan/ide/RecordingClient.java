package se.alanif.alan.ide;

import java.lang.reflect.Proxy;
import java.util.List;

import org.eclipse.lsp4j.PublishDiagnosticsParams;
import org.eclipse.lsp4j.services.LanguageClient;

/**
 * A LanguageClient that only remembers what was published to it.
 *
 * <p>A proxy rather than a written-out stub: LanguageClient has a dozen methods we do
 * not care about, and a real implementation would be a page of empty bodies that has
 * to be edited whenever lsp4j adds one.
 */
final class RecordingClient {

	private RecordingClient() {
	}

	static LanguageClient into(List<PublishDiagnosticsParams> sink) {
		return (LanguageClient) Proxy.newProxyInstance(
				RecordingClient.class.getClassLoader(),
				new Class<?>[] { LanguageClient.class },
				(proxy, method, args) -> {
					if ("publishDiagnostics".equals(method.getName()) && args != null) {
						sink.add((PublishDiagnosticsParams) args[0]);
					}
					return null;
				});
	}
}
