package com.filipinodama.app.ui.screens.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.filipinodama.app.data.profile.resolveAvatarUrl
import com.filipinodama.app.data.profile.resolveFrameUrl
import com.filipinodama.app.ui.theme.Gold

/**
 * AvatarView — masked circular portrait token with an optional cosmetic frame
 * overlay, a Compose port of apps/web/src/components/Avatar.tsx: opaque
 * portrait PNGs are always clipped to a circle with a gold ring (never a raw
 * rectangle), and an equipped frame renders as a slightly-larger transparent
 * overlay on top. Art loads remotely via Coil (see StoreAssets.kt /
 * AvatarAssets.kt for the remote-over-bundled rationale).
 */
@Composable
fun AvatarView(
    avatarUrl: String?,
    size: Dp = 56.dp,
    frameId: String? = null,
    ring: Boolean = true,
    onClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val portraitUrl = resolveAvatarUrl(avatarUrl)
    val frameUrl = resolveFrameUrl(frameId)
    val overlayInset = size * 0.16f

    Box(
        modifier = modifier
            .size(size + overlayInset * 2)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
    ) {
        Box(
            modifier = Modifier
                .size(size)
                .align(androidx.compose.ui.Alignment.Center)
                .clip(CircleShape)
                .background(Color(0xFF160B28))
                .then(
                    if (ring) Modifier.border(2.dp, Gold.copy(alpha = 0.6f), CircleShape) else Modifier
                )
        ) {
            AsyncImage(
                model = portraitUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(size)
            )
        }
        if (frameUrl != null) {
            AsyncImage(
                model = frameUrl,
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier.size(size + overlayInset * 2)
            )
        }
    }
}
