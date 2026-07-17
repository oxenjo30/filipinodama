package com.filipinodama.app.ui.screens.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.filipinodama.app.data.legal.LEGAL_DOCS
import com.filipinodama.app.ui.components.screenInsetsBottomOnly
import com.filipinodama.app.ui.components.screenInsetsTopOnly
import com.filipinodama.app.ui.theme.Gold
import com.filipinodama.app.ui.theme.GoldLt
import com.filipinodama.app.ui.theme.Ink
import com.filipinodama.app.ui.theme.Ink2
import com.filipinodama.app.ui.theme.Panel

/**
 * LegalScreen — mirrors apps/web LegalLayout.tsx: the same five documents
 * (Privacy, Terms, Community, Fair Play & Anti-Cheat, Data & Account), same
 * copy (see [LEGAL_DOCS], transcribed verbatim from web's `LEGAL_DATA`), same
 * "§ "/"• " paragraph convention. Reached from SettingsScreen's About/Legal
 * rows, opened directly to the tapped document with its own tab strip to
 * switch between the other four without leaving the screen (matching web's
 * sticky sidebar behavior, just laid out for a phone-width column instead of
 * a two-column desktop grid).
 */
@Composable
fun LegalScreen(initialKey: String, onBack: () -> Unit) {
    var active by remember { mutableStateOf(initialKey) }
    val doc = LEGAL_DOCS[active] ?: LEGAL_DOCS.getValue("terms")

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).screenInsetsTopOnly()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            com.filipinodama.app.ui.components.MockupBackButton(onClick = onBack)
            Text("Legal & Policies", color = GoldLt, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            LEGAL_TABS.forEach { (key, label) ->
                val on = active == key
                Text(
                    label,
                    color = if (on) GoldLt else Ink2,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = if (on) FontWeight.Bold else FontWeight.Normal,
                    modifier = Modifier
                        .clickable { active = key }
                        .background(if (on) Gold.copy(alpha = 0.15f) else Panel, RoundedCornerShape(999.dp))
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                )
            }
        }

        Column(
            modifier = Modifier.fillMaxSize().screenInsetsBottomOnly().verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(doc.kicker.uppercase(), color = Gold, style = MaterialTheme.typography.labelSmall)
            Text(doc.title, color = GoldLt, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text("Last updated ${doc.updated}", color = Ink2, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(bottom = 12.dp))
            Text(doc.intro, color = Ink, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(bottom = 18.dp))

            doc.sections.forEach { section ->
                Column(modifier = Modifier.padding(bottom = 20.dp)) {
                    Row {
                        if (section.no.isNotEmpty()) {
                            Text("${section.no}  ", color = Gold, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                        }
                        Text(section.heading, color = androidx.compose.ui.graphics.Color.White, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    }
                    Column(modifier = Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        section.paras.forEach { para -> LegalParagraph(para) }
                    }
                }
            }
        }
    }
}

private val LEGAL_TABS = listOf(
    "howto" to "How to Play",
    "faq" to "Help & FAQ",
    "privacy" to "Privacy",
    "terms" to "Terms",
    "community" to "Community",
    "anticheat" to "Fair Play",
    "data" to "Data & Account"
)

@Composable
private fun LegalParagraph(text: String) {
    when {
        text.startsWith("§ ") -> Text(
            text.removePrefix("§ "),
            color = GoldLt,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold
        )
        text.startsWith("• ") -> Row {
            Text("•  ", color = Gold, style = MaterialTheme.typography.bodySmall)
            Text(text.removePrefix("• "), color = Ink, style = MaterialTheme.typography.bodySmall)
        }
        else -> Text(text, color = Ink, style = MaterialTheme.typography.bodySmall)
    }
}
