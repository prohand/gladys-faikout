# Faikout

Diese Integration verbindet Gladys mit Ihren **Daikin**-Klimageräten, die mit
einem [**Faikout**](https://www.faikin.au)-Modul (früher _Faikin_) ausgestattet
sind. Der Faikout ersetzt das ursprüngliche WLAN-Modul und wird **lokal** in
Ihrem eigenen Netzwerk gesteuert: keine Cloud, kein Konto, kein Internet nötig.

In Gladys wird jedes Klimagerät zu einem Gerät mit:

- **Ein/Aus**, **Modus** (Auto, Kühlen, Heizen, Entfeuchten, nur Lüften),
  **Sollwert** und **Lüftergeschwindigkeit**;
- horizontalem und vertikalem **Schwenken** (ein oder aus: keine feste Position) sowie den Modi **Econo**, **Powerful**,
  **Comfort**, **Streamer** und **leises Außengerät**, sofern Ihr Gerät
  sie hat;
- den Messwerten: **Raumtemperatur**, **Außentemperatur**, **Ansaug-** und
  **Kältemitteltemperatur**, **Luftfeuchtigkeit**, **Leistungsaufnahme** und **Energiezähler** (kWh).

Die Integration legt nur an, was Ihr Klimagerät tatsächlich meldet: Eine
Funktion, die Ihrem Modell fehlt, erscheint nicht.

## Bevor Sie beginnen

1. Bauen Sie das Faikout-Modul in das Klimagerät ein (siehe die
   [Faikout-Installationsanleitung](https://codeberg.org/RevK/ESP32-Faikout/src/branch/main/Manuals/Setup.md)).
2. Verbinden Sie es mit Ihrem WLAN: Beim ersten Start öffnet es einen eigenen
   Zugangspunkt mit einer Einrichtungsseite.
3. Prüfen Sie, dass Sie seine Webseite (`http://<module address>/`) aus Ihrem
   Netzwerk öffnen und das Klimagerät darüber steuern können.
4. **Geben Sie ihm eine feste IP-Adresse** (eine DHCP-Reservierung in Ihrem
   Router). Diese Adresse verwendet Gladys.

Gladys spricht mit dem Modul so wie dessen eigene Webseite: Lassen Sie die
**Websteuerung** des Faikout aktiviert (`webcontrol`, standardmäßig aktiv).

## Konfiguration

Unter **Integrationen → Faikout → Konfiguration**:

| Feld                         | Rolle                                                                                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Faikout-Geräte**           | Die Adresse jedes Moduls, durch Kommas getrennt. Ein Name gefolgt von `=` vor der Adresse benennt das Gerät.                                                                 |
| **Web-Passwort**             | Nur wenn in den Faikout-Einstellungen ein **Web-Passwort** festgelegt ist (dasselbe für alle Geräte). Sonst leer lassen. Das Passwort der Einstellungen wird nicht benötigt. |
| **Aktualisierungsintervall** | Wie oft jedes Klimagerät gelesen wird, in Sekunden (standardmäßig 30, 5 bis 600). Eine Änderung mit der Fernbedienung erscheint innerhalb dieser Zeit in Gladys.             |

Beispiel:

```
Living room=192.168.1.50, Bedroom=192.168.1.51, 192.168.1.52
```

- Ohne Namen übernimmt das Gerät den eigenen Namen des Moduls (seinen _Hostnamen_).
- Ein Name auf `.local` (z. B. `guestac.local`) wird im Container der
  Integration oft **nicht aufgelöst**: Verwenden Sie lieber die IP-Adresse.
- Ein anderer Port als 80 wird `192.168.1.50:8080` geschrieben.
- Mit einem **Web-Passwort** sendet Gladys es so, wie es die Faikout-Seite nach
  der Anmeldung tut (ein Cookie, im Klartext in Ihrem Netzwerk, wie die
  Faikout-Einstellungen warnen). Das Passwort der Einstellungen bleibt Gladys
  unbekannt: Es wird nie benötigt.

Klicken Sie dann auf **Verbindung testen**: Für jedes Gerät sagt die Meldung,
ob es antwortet, sein Modell, sein Protokoll (S21, X50A…), seinen Modus und die
Raumtemperatur.

Öffnen Sie schließlich den Tab **Entdecken** der Integration und legen Sie die
angebotenen Geräte an.

## Was das Badge jedes Geräts bedeutet

| Badge                            | Bedeutung                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| **Lokal**                        | Der Faikout antwortet, das Klimagerät ebenfalls.                                    |
| **Lokal** + orangefarbener Punkt | Der Faikout antwortet, aber **nicht das Klimagerät**: Prüfen Sie das S21/X50-Kabel. |
| **Nicht erreichbar**             | Der Faikout antwortet nicht: ausgeschaltet, nicht im WLAN oder eine neue Adresse.   |

## Szenen

### Auslöser

| Auslöser                                              | Wann                                                                                                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ein Klimagerät geht offline oder ist wieder da**    | Der Faikout antwortet nicht mehr (Grund `unreachable`), das Klimagerät antwortet dem Faikout nicht mehr (Grund `aircon`), und dann, wenn alles wieder antwortet. |
| **Ein Klimagerät wird außerhalb von Gladys geändert** | Ein/Aus, Modus, Sollwert oder Lüfter mit der IR-Fernbedienung, der Faikout-Webseite oder einem Faikout-Timer geändert. Nie durch Gladys selbst.                  |
| **Ein Klimagerät beginnt oder beendet das Abtauen**   | Beim Heizen bei Kälte stoppt das Außengerät für einige Minuten, um sein Eis abzutauen.                                                                           |

Jeder Auslöser kann nach Klimagerät und nach Zustand (oder danach, was sich
geändert hat) gefiltert werden. Die Werte sind in der Szene verfügbar, z. B.
`{{triggerEvent.data.mode}}` oder `{{triggerEvent.data.temperature}}`.

Änderungen durch **Faikout auto** (das den Sollwert und den Modus selbst
verändert) lösen „außerhalb von Gladys geändert“ nicht aus.

### Aktionen

| Aktion                        | Rolle                                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ein Klimagerät einstellen** | Ein/Aus, Modus, Sollwert und Lüfter auf einmal. Ein leer gelassenes Feld behält seinen Wert.                                                               |
| **Faikout auto einstellen**   | Der Faikout heizt oder kühlt selbst, um den Raum zwischen _Ziel − Spanne_ und _Ziel + Spanne_ zu halten. Eine Spanne von 0 stoppt ihn.                     |
| **Ein Klimagerät lesen**      | Ein frischer Messwert: online, Ein/Aus, Modus, Sollwert, Raum- und Außentemperatur, Luftfeuchtigkeit. Schlägt nie fehl: Prüfen Sie die Ausgabe **Online**. |

Ihre Ausgaben können von den nächsten Aktionen der Szene verwendet werden
(Bedingungen, Nachrichten…).

Für einen einzelnen Befehl (einschalten, den Sollwert ändern) funktioniert auch
die Standardaktion **Gerätewert setzen** von Gladys.

## Energieüberwachung

Wenn das Klimagerät seinen Energiezähler meldet (Faikout-Feld `Whoutside`,
meist mit dem S21-Protokoll), erhält das Gerät eine Funktion **Energiezähler**
in kWh. Es ist ein _Zählerstand_: Gladys leitet daraus selbst den Verbrauch pro
30 Minuten und seine Kosten ab und zeigt sie unter **Energie** an.

- Sobald das Gerät angelegt ist, öffnen Sie **Energie** in Gladys: Das
  Klimagerät ist dort aufgeführt, an Ihren Hauptzähler angehängt, falls Sie
  einen haben.
- Der Zähler bewegt sich in Schritten von 100 Wh: Über einen kurzen Zeitraum
  erscheint der Verbrauch in Stufen.
- Die **Leistungsaufnahme** (in W) bleibt für Live-Werte verfügbar.
- Ein Klimagerät, das diesen Zähler nicht meldet, erhält die Funktion nicht.
- **Multi-Split** (mehrere Innengeräte an einem Außengerät): Der Zähler ist der
  des Außengeräts, daher kann jeder Faikout denselben melden: Prüfen Sie unter
  **Energie**, dass er nicht doppelt gezählt wird.

## Dashboard-Widgets

- **Faikout-Klimagerät**: ein Gerät. Live-Kacheln (Raum, Sollwert, außen,
  Leistung), eine Kurve der Raum-, Soll- und Außentemperatur über 24 h, dann
  Zustand, Modus, Lüfter, Lamellen, Komfortmodi sowie Faikout auto oder Abtauen,
  solange sie laufen. Eine Schaltfläche **Einschalten** oder **Ausschalten**
  (das Gegenteil des aktuellen Zustands) und **Aktualisieren**. Wählen Sie das
  Gerät in den Widget-Einstellungen.
- **Faikout-Übersicht**: alle Ihre Klimageräte auf einer Karte, mit ihrem Modus
  und der Raumtemperatur.

## Fehlerbehebung

- **„keine Antwort“** beim Verbindungstest: Öffnen Sie `http://<address>/` von
  einem Computer im selben Netzwerk wie Gladys. Wenn sich die Seite nicht
  öffnet, liegt das Problem am Netzwerk (Adresse, WLAN, VLAN), nicht an Gladys.
- **„Web-Passwort fehlt oder ist falsch“**: Auf dem Faikout ist ein
  Web-Passwort festgelegt. Geben Sie dasselbe unter **Web-Passwort** ein
  (kopieren Sie es aus den Faikout-Einstellungen).
- **Ein Befehl schlägt mit „did not apply“ fehl**: Das Klimagerät hat diese
  Funktion nicht, oder der Faikout kann sie nicht steuern.
- **Faikout auto greift nicht**: Der Faikout wird von einem externen Regler
  gesteuert (EnvMon, MQTT-Befehl `control`), der Vorrang hat.
- **Ein Gerät bleibt nach einer Adressänderung nicht erreichbar**: Tragen Sie
  die neue Adresse unter **Faikout-Geräte** ein. Das Gladys-Gerät ist an die
  MAC-Adresse des Moduls gebunden: Es behält seinen Verlauf und seine Szenen.

## Datenschutz

Alles bleibt in Ihrem Netzwerk: Die Integration spricht nur mit den Adressen,
die Sie ihr geben, über lokales HTTP und WebSocket. Das Web-Passwort, falls
vorhanden, wird von Gladys mit der Konfiguration gespeichert und nur an die
Geräte gesendet. In ihrem Volume `/data` speichert sie nur die MAC-Adresse, den
Namen, das Modell und die Funktionsliste jedes Geräts, um seine Geräte auch
dann wiederzufinden, wenn ein Klimagerät beim Start ausgeschaltet ist.
