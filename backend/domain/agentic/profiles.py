"""Effect and data-egress policy snapshots for universal execution steps."""

from __future__ import annotations

from typing import Tuple

from pydantic import Field, field_validator, model_validator

from backend.domain.agentic.base import AgenticContractModel, CanonicalKey
from backend.domain.agentic.enums import (
    DataEgressMode,
    EffectExternality,
    EffectFlag,
    MutationKind,
)
from backend.domain.orchestration.enums import CLASSIFICATION_ORDER, DataClassification


class EffectProfileV1(AgenticContractModel):
    externality: EffectExternality = EffectExternality.NONE
    mutation: MutationKind = MutationKind.NONE
    flags: Tuple[EffectFlag, ...] = Field(default_factory=tuple, max_length=20)

    @field_validator("flags")
    @classmethod
    def flags_are_canonical(
        cls, values: Tuple[EffectFlag, ...]
    ) -> Tuple[EffectFlag, ...]:
        canonical = tuple(sorted(set(values), key=lambda item: item.value))
        if values != canonical:
            raise ValueError("effect flags must be sorted and unique")
        return values

    @model_validator(mode="after")
    def validate_effect_shape(self) -> "EffectProfileV1":
        if (
            self.mutation != MutationKind.NONE
            and self.externality != EffectExternality.WRITE
        ):
            raise ValueError("a mutation requires write externality")
        write_only_flags = {
            EffectFlag.DESTRUCTIVE,
            EffectFlag.EXTERNAL_DISCLOSURE,
            EffectFlag.RECURRING_COMMITMENT,
        }
        if (
            write_only_flags.intersection(self.flags)
            and self.externality != EffectExternality.WRITE
        ):
            raise ValueError("write-only effect flags require write externality")
        return self


class DataEgressProfileV1(AgenticContractModel):
    """Policy labels for data leaving a bounded execution context."""

    mode: DataEgressMode = DataEgressMode.DENY_ALL
    destination_classes: Tuple[CanonicalKey, ...] = Field(
        default_factory=tuple,
        max_length=50,
    )
    provider_classes: Tuple[CanonicalKey, ...] = Field(
        default_factory=tuple,
        max_length=50,
    )
    region_classes: Tuple[CanonicalKey, ...] = Field(
        default_factory=tuple,
        max_length=50,
    )
    permitted_input_classifications: Tuple[DataClassification, ...] = Field(
        default_factory=tuple,
        max_length=4,
    )
    permitted_output_classifications: Tuple[DataClassification, ...] = Field(
        default_factory=tuple,
        max_length=4,
    )
    redaction_required: bool = False
    dlp_required: bool = False
    provider_retention_policy_required: bool = False
    provider_training_policy_required: bool = False

    @field_validator(
        "destination_classes",
        "provider_classes",
        "region_classes",
    )
    @classmethod
    def keys_are_canonical(cls, values: Tuple[str, ...]) -> Tuple[str, ...]:
        if values != tuple(sorted(set(values))):
            raise ValueError("egress policy keys must be sorted and unique")
        return values

    @field_validator(
        "permitted_input_classifications",
        "permitted_output_classifications",
    )
    @classmethod
    def classifications_are_canonical(
        cls, values: Tuple[DataClassification, ...]
    ) -> Tuple[DataClassification, ...]:
        canonical = tuple(sorted(set(values), key=CLASSIFICATION_ORDER.__getitem__))
        if values != canonical:
            raise ValueError("egress classifications must be sorted and unique")
        return values

    @model_validator(mode="after")
    def deny_all_has_no_release_policy(self) -> "DataEgressProfileV1":
        if self.mode == DataEgressMode.DENY_ALL and any(
            (
                self.destination_classes,
                self.provider_classes,
                self.region_classes,
                self.permitted_input_classifications,
                self.permitted_output_classifications,
            )
        ):
            raise ValueError(
                "deny-all egress cannot declare release destinations or data classes"
            )
        if self.mode == DataEgressMode.POLICY_BOUND_EXTERNAL:
            if not self.destination_classes:
                raise ValueError("external egress requires a destination class")
            if not self.region_classes:
                raise ValueError("external egress requires a region class")
            if not self.permitted_input_classifications:
                raise ValueError(
                    "external egress requires permitted input classifications"
                )
        return self


EgressProfileV1 = DataEgressProfileV1


__all__ = ["DataEgressProfileV1", "EffectProfileV1", "EgressProfileV1"]
