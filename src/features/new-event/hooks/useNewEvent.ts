import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EVENTNAME_REGEX, NOT_ALLOWED_EVENTNAMES_REGEX, SUBDOMAIN_REGEX } from "../../../constants";
import { Availability } from "../../../types";
import { ApiClient } from "../../../api/client";
import { redirectToAdmin } from "../../../lib/navigation";
import { useSessionStore } from "../../../lib/sessionStore";

export type UseNewEventOptions = {
  baseDomain: string;
  supportSubdomain: boolean;
};

export type UseNewEventResult = {
  name: string;
  setName: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  eventId: string;
  setEventId: (value: string) => void;
  guestPassword: string;
  setGuestPassword: (value: string) => void;
  adminPassword: string;
  setAdminPassword: (value: string) => void;
  adminPasswordConfirm: string;
  setAdminPasswordConfirm: (value: string) => void;
  availability: Availability;
  availabilityMessage: string;
  submitError: string;
  fullDomain: string;
  adminPasswordRef: React.MutableRefObject<HTMLInputElement | null>;
  adminPasswordConfirmRef: React.MutableRefObject<HTMLInputElement | null>;
  ensureAdminValidity: () => void;
  ensureConfirmValidity: () => void;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export const useNewEvent = ({
  baseDomain,
  supportSubdomain,
}: UseNewEventOptions): UseNewEventResult => {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [eventId, setEventId] = useState("");
  const [guestPassword, setGuestPassword] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState("");
  const [availability, setAvailability] = useState<Availability>("idle");
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [submitError, setSubmitError] = useState("");
  const adminPasswordRef = useRef<HTMLInputElement | null>(null);
  const adminPasswordConfirmRef = useRef<HTMLInputElement | null>(null);

  const fullDomain = useMemo(() => {
    const trimmed = eventId.trim().replace(/\s+/g, "-");
    if (supportSubdomain) {
      return trimmed ? `${trimmed}.${baseDomain}` : `subdomain.${baseDomain}`;
    }
    return trimmed ? `${baseDomain}/${trimmed}` : `${baseDomain}/pfad`;
  }, [baseDomain, eventId, supportSubdomain]);

  const ensureAdminValidity = () => {
    const field = adminPasswordRef.current;
    if (!field) return;
    if (field.value.length < 8) {
      field.setCustomValidity(t("NewEventView.adminPasswordInvalid"));
    } else {
      field.setCustomValidity("");
    }
  };

  const ensureConfirmValidity = () => {
    const field = adminPasswordConfirmRef.current;
    if (!field) return;
    if (adminPassword !== adminPasswordConfirm) {
      field.setCustomValidity(t("NewEventView.adminPasswordRepeatInvalid"));
    } else if (field.value.length < 8) {
      field.setCustomValidity(t("NewEventView.adminPasswordInvalid"));
    } else {
      field.setCustomValidity("");
    }
  };

  const normalizedSubdomain = useMemo(() => eventId.trim().toLowerCase(), [eventId]);

  useEffect(() => {
    const candidate = normalizedSubdomain;
    if (!candidate) {
      setAvailability("idle");
      setAvailabilityMessage("");
      return;
    }
    if (candidate.length < 3) {
      setAvailability("invalid");
      setAvailabilityMessage(
        supportSubdomain ? t("NewEventView.subdomainTooShort") : t("NewEventView.pathTooShort")
      );
      return;
    }
    if (!EVENTNAME_REGEX.test(candidate)) {
      setAvailability("invalid");
      setAvailabilityMessage(t("NewEventView.availabilityInvalid"));
      return;
    }
    if (!NOT_ALLOWED_EVENTNAMES_REGEX.test(candidate) || !SUBDOMAIN_REGEX.test(candidate)) {
      setAvailability("invalid");
      setAvailabilityMessage(
        supportSubdomain ? t("NewEventView.subdomainNotAllowed") : t("NewEventView.pathNotAllowed")
      );
      return;
    }

    const controller = new AbortController();
    const check = async () => {
      setAvailability("checking");
      setAvailabilityMessage("");
      try {
        const result = await ApiClient.anonymous().checkSubdomainAvailability(candidate);

        if (result) {
          setAvailability("available");
          setAvailabilityMessage(t("NewEventView.availabilityAvailable"));
          return;
        }

        setAvailability("taken");
        setAvailabilityMessage(t("NewEventView.availabilityTaken"));
      } catch {
        if (controller.signal.aborted) return;
        setAvailability("error");
        setAvailabilityMessage(t("NewEventView.availabilityError"));
      }
    };

    const timeout = setTimeout(check, 300);
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [normalizedSubdomain, supportSubdomain, t]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    if (!trimmedName) {
      setSubmitError(t("NewEventView.formErrorNameMissing"));
      return;
    }
    if (trimmedName.length > 48) {
      setSubmitError(t("NewEventView.formErrorNameTooLong"));
      return;
    }
    if (trimmedDescription.length > 2048) {
      setSubmitError(t("NewEventView.formErrorDescriptionTooLong"));
      return;
    }
    if (availability === "invalid") {
      setSubmitError(
        supportSubdomain
          ? t("NewEventView.formErrorSubdomainInvalid")
          : t("NewEventView.formErrorPathInvalid")
      );
      return;
    }
    if (availability === "taken") {
      setSubmitError(t("NewEventView.formErrorSubdomainTaken"));
      return;
    }
    if (availability === "checking") {
      setSubmitError(t("NewEventView.formErrorChecking"));
      return;
    }
    if (availability === "error") {
      setSubmitError(t("NewEventView.formErrorUnavailable"));
      return;
    }

    ensureAdminValidity();
    ensureConfirmValidity();

    const formValid = event.currentTarget.checkValidity();
    if (!formValid) {
      event.currentTarget.reportValidity();
      return;
    }

    try {
      const client = ApiClient.anonymous();
      const response = await client.createEvent({
        name: trimmedName,
        description: trimmedDescription || undefined,
        eventId: normalizedSubdomain,
        allowedMimeTypes: [],
        guestPassword,
        adminPassword,
        adminPasswordConfirm,
      });

      const { setAdminToken } = useSessionStore.getState();
      setAdminToken(adminPassword);

      redirectToAdmin(response.eventId, baseDomain, supportSubdomain);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("NewEventView.submitErrorServer");
      setSubmitError(message);
    }
  };

  return {
    name,
    setName,
    description,
    setDescription,
    eventId,
    setEventId,
    guestPassword,
    setGuestPassword,
    adminPassword,
    setAdminPassword,
    adminPasswordConfirm,
    setAdminPasswordConfirm,
    availability,
    availabilityMessage,
    submitError,
    fullDomain,
    adminPasswordRef,
    adminPasswordConfirmRef,
    ensureAdminValidity,
    ensureConfirmValidity,
    handleSubmit,
  };
};
