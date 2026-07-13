package com.filipinodama.app.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.isUnspecified
import com.filipinodama.app.R

/**
 * Real handoff currency/reward icons (ic-coin.png, ic-gem.png, ic-trophy.png,
 * ic-chest.png — ASSETS.md "Currency & reward icons"), replacing the
 * 🪙/💎/🏆/🎁 emoji glyphs the app previously drew per the owner directive
 * ("the handoff contains already the assets to be used... do not reinvent").
 *
 * Two shapes are offered because emoji were used two ways in the codebase:
 *  - standalone icon slot (e.g. a card's leading icon) -> [CurrencyIcon]
 *  - inline "<icon> <amount>" pairing inside what used to be one Text -> [CurrencyAmount]
 */
enum class CurrencyIconKind { COIN, GEM, TROPHY, CHEST }

private fun CurrencyIconKind.drawableRes(): Int = when (this) {
    CurrencyIconKind.COIN -> R.drawable.ic_coin
    CurrencyIconKind.GEM -> R.drawable.ic_gem
    CurrencyIconKind.TROPHY -> R.drawable.ic_trophy
    CurrencyIconKind.CHEST -> R.drawable.ic_chest
}

/** A standalone currency/reward icon image, sized in dp. */
@Composable
fun CurrencyIcon(kind: CurrencyIconKind, modifier: Modifier = Modifier, size: Dp = 22.dp) {
    Image(
        painter = painterResource(id = kind.drawableRes()),
        contentDescription = null,
        modifier = modifier.size(size)
    )
}

/**
 * "<icon> <amount>" inline pairing — the direct replacement for strings like
 * `"🪙 $value"` or `"+${gold} 🪙"` that can no longer live inside a single
 * Text once the glyph is a real image. Icon is sized to roughly match the
 * surrounding text's cap-height (fontSize-derived) so it sits inline
 * cleanly regardless of which typography scale the call site uses.
 */
@Composable
fun CurrencyAmount(
    kind: CurrencyIconKind,
    text: String,
    modifier: Modifier = Modifier,
    color: androidx.compose.ui.graphics.Color = LocalTextStyle.current.color,
    style: TextStyle = LocalTextStyle.current,
    prefix: String = "",
    suffix: String = ""
) {
    val fs = style.fontSize
    val iconSize = if (!fs.isUnspecified) (fs.value * 1.15f).dp else 16.dp
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        if (prefix.isNotEmpty()) Text(prefix, color = color, style = style)
        Image(painter = painterResource(id = kind.drawableRes()), contentDescription = null, modifier = Modifier.size(iconSize))
        Text(text + suffix, color = color, style = style)
    }
}
